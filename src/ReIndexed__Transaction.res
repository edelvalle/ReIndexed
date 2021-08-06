open Belt
open IDB

let openCursor = (store, attribute, range) => {
  let openCursor = switch attribute {
  | None => store->Store.openCursor
  | Some(attribute) =>
    if attribute == store->Store.keyPath {
      store->Store.openCursor
    } else {
      store->Store.index(attribute)->Index.openCursor
    }
  }
  openCursor(range)
}

let simpleQuery = (store, term, gather, predicate) => {
  let (attribute, range) = switch term {
  | #all => (None, None)
  | #is(attribute, value) => (Some(attribute), Some(KeyRange.only(value)))
  | #lt(attribute, value) => (Some(attribute), Some(KeyRange.upperBound(value, true)))
  | #lte(attribute, value) => (Some(attribute), Some(KeyRange.upperBound(value, false)))
  | #gt(attribute, value) => (Some(attribute), Some(KeyRange.lowerBound(value, true)))
  | #gte(attribute, value) => (Some(attribute), Some(KeyRange.lowerBound(value, false)))
  | #between(attribute, lower, upper) => {
      let (lower_value, lower_exclude) = switch lower {
      | #incl(value) => (value, false)
      | #excl(value) => (value, true)
      }
      let (upper_value, upper_exclude) = switch upper {
      | #incl(value) => (value, false)
      | #excl(value) => (value, true)
      }
      (
        Some(attribute),
        Some(KeyRange.bound(lower_value, upper_value, lower_exclude, upper_exclude)),
      )
    }
  | _ => (None, None)
  }

  openCursor(store, attribute, range)->Request.onsuccess(event => {
    switch event->CursorEvent.cursor->Js.Nullable.toOption {
    | None => gather(None)
    | Some(cursor) => {
        let value = cursor->Cursor.value
        switch predicate {
        | None => gather(Some(value))
        | Some(predicate) =>
          if predicate(value) {
            gather(Some(value))
          }
        }
        cursor->Cursor.continue
      }
    }
  })
}

let anyOf = (store, attribute, values, gather, predicate) => {
  switch values {
  | [] => gather(None)
  | [value] => simpleQuery(store, #is(attribute, value), gather, predicate)
  | values => {
      let values = values->Set.String.fromArray->Set.String.toArray->Js.Array2.sortInPlace
      let n_values = values->Array.length
      let lower = values->Array.getUnsafe(0)
      let upper = values->Array.getUnsafe(n_values - 1)
      let range = KeyRange.bound(lower, upper, false, false)
      let i = ref(0)
      openCursor(store, Some(attribute), Some(range))->Request.onsuccess(event => {
        switch event->CursorEvent.cursor->Js.Nullable.toOption {
        | None => gather(None)
        | Some(cursor) => {
            let key = cursor->Cursor.key
            while i.contents < n_values && key > values->Array.getUnsafe(i.contents) {
              i := i.contents + 1
              if i.contents == n_values {
                gather(None)
              }
            }
            if i.contents < n_values {
              let currentValue = values->Array.getUnsafe(i.contents)
              if key == currentValue {
                gather(Some(cursor->Cursor.value))
                cursor->Cursor.continue
              } else {
                cursor->Cursor.continueTo(currentValue)
              }
            }
          }
        }
      })
    }
  }
}

let rec query = (store, expression, callback, predicate) => {
  switch expression {
  | #all
  | #is(_, _)
  | #lt(_, _)
  | #lte(_, _)
  | #gt(_, _)
  | #gte(_, _)
  | #between(_, _, _) => {
      let results = []
      let gather = item => {
        switch item {
        | Some(item) => results->Js.Array2.push(item)->ignore
        | None => callback(results)
        }
      }
      simpleQuery(store, expression, gather, predicate)
    }
  | #anyOf(attribute, values) => {
      let results = []
      let gather = item => {
        switch item {
        | Some(item) => results->Js.Array2.push(item)->ignore
        | None => callback(results)
        }
      }
      anyOf(store, attribute, values, gather, predicate)
    }
  | #And(left, right) => {
      let resultCounter = Js.Dict.empty()
      let results = Js.Dict.empty()
      let awaiting = ref(2)
      let gather = items => {
        items->Array.forEach(item => {
          switch resultCounter->Js.Dict.get(item["id"]) {
          | Some(count) => resultCounter->Js.Dict.set(item["id"], count + 1)
          | None => {
              resultCounter->Js.Dict.set(item["id"], 1)
              results->Js.Dict.set(item["id"], item)
            }
          }
        })
        awaiting := awaiting.contents - 1
        if awaiting.contents == 0 {
          resultCounter
          ->Js.Dict.entries
          ->Array.keepMap(((id, counter)) => {
            if counter == 2 {
              results->Js.Dict.get(id)
            } else {
              None
            }
          })
          ->callback
        }
      }
      query(store, left, gather, predicate)
      query(store, right, gather, predicate)
    }
  | #Or(left, right) => {
      let results = Js.Dict.empty()
      let awaiting = ref(2)
      let gather = items => {
        items->Array.forEach(item => {results->Js.Dict.set(item["id"], item)})
        awaiting := awaiting.contents - 1
        if awaiting.contents == 0 {
          results->Js.Dict.values->callback
        }
      }
      query(store, left, gather, predicate)
      query(store, right, gather, predicate)
    }
  }
}

let getTransactionStores = storeCommands => {
  storeCommands->Array.keepMap(((name, commands)) => {
    if commands->Array.length > 0 {
      Some(name)
    } else {
      None
    }
  })
}

let getTransactionMode = storeCommands => {
  let isWriteTransaction = storeCommands->Array.some(((_, commands)) => {
    commands->Array.some(command => {
      switch command {
      | #save(_) | #delete(_) | #updateWhen(_, _) | #deleteWhen(_) | #clear => true
      | #get(_) | #filter(_, _) | #query(_) => false
      }
    })
  })
  isWriteTransaction ? #readwrite : #readonly
}

let execute = (db, requests) => {
  let response = Js.Dict.empty()
  requests->Js.Dict.keys->Array.forEach(key => response->Js.Dict.set(key, []))

  let storeCommands =
    requests->Js.Dict.entries->Array.keep(((_key, actions)) => actions->Array.length != 0)
  Js.Promise.make((~resolve, ~reject) => {
    reject->ignore
    let storeNames = getTransactionStores(storeCommands)
    if storeNames->Array.length == 0 {
      resolve(. response)
    } else {
      let transaction = db->Database.transaction(storeNames, getTransactionMode(storeCommands))
      transaction->Transaction.oncomplete(() => resolve(. response))
      storeCommands->Array.forEach(((storeName, commands)) => {
        let store = transaction->Transaction.objectStore(storeName)
        commands->Array.forEach(command => {
          switch command {
          | #clear => store->Store.clear->ignore
          | #save(item) => store->Store.put(item)->ignore
          | #delete(id) => store->Store.delete(id)->ignore
          | #get(id) => {
              let request = store->Store.get(id)
              request->Request.onsuccess(_ => {
                switch request->Request.result {
                | Some(item) =>
                  response->Js.Dict.unsafeGet(store->Store.name)->Js.Array2.push(item)->ignore
                | None => ()
                }
              })
            }
          | #query(expression) =>
            query(
              store,
              expression,
              results => {
                response->Js.Dict.unsafeGet(store->Store.name)->Js.Array2.pushMany(results)->ignore
              },
              None,
            )
          | #filter(expression, predicate) =>
            query(
              store,
              expression,
              results => {
                response->Js.Dict.unsafeGet(store->Store.name)->Js.Array2.pushMany(results)->ignore
              },
              predicate,
            )
          | #updateWhen(expression, transformer) =>
            query(
              store,
              expression,
              results => {
                results
                ->Array.keepMap(transformer)
                ->Array.forEach(item => store->Store.put(item)->ignore)
              },
              None,
            )
          | #deleteWhen(expression) =>
            query(
              store,
              expression,
              results => {
                results->Array.forEach(item => store->Store.delete(item["id"])->ignore)
              },
              None,
            )
          }
        })
      })
    }
  })
}

open Belt
open IDB

type index = string
type value = string
type bound =
  | Incl(value)
  | Excl(value)

type rec read<'a> =
  | NoOp
  | All
  | Get(value)
  | Is(index, value)
  | Lt(index, value)
  | Lte(index, value)
  | Gt(index, value)
  | Gte(index, value)
  | Between(index, bound, bound)
  | AnyOf(index, array<value>)
  | Filter(read<'a>, 'a => bool)
  | And(read<'a>, read<'a>)
  | Or(read<'a>, read<'a>)

type write<'a> =
  | Clear
  | Save('a)
  | Delete(value)

type query<'a, 'b> =
  | Read('a)
  | Write('b)

// type queries<'a> = array<Js.Dict.t<'a> => query<'a>>

let _openCursor = (store, attribute, range) => {
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

let _simpleQuery = (store, term, gather) => {
  let (attribute, range) = switch term {
  | All => (None, None)
  | Is(attribute, value) => (Some(attribute), Some(KeyRange.only(value)))
  | Lt(attribute, value) => (Some(attribute), Some(KeyRange.upperBound(value, true)))
  | Lte(attribute, value) => (Some(attribute), Some(KeyRange.upperBound(value, false)))
  | Gt(attribute, value) => (Some(attribute), Some(KeyRange.lowerBound(value, true)))
  | Gte(attribute, value) => (Some(attribute), Some(KeyRange.lowerBound(value, false)))
  | Between(attribute, lower, upper) => {
      let (lower_value, lower_exclude) = switch lower {
      | Incl(value) => (value, false)
      | Excl(value) => (value, true)
      }
      let (upper_value, upper_exclude) = switch upper {
      | Incl(value) => (value, false)
      | Excl(value) => (value, true)
      }
      (
        Some(attribute),
        Some(KeyRange.bound(lower_value, upper_value, lower_exclude, upper_exclude)),
      )
    }
  | _ => (None, None)
  }

  _openCursor(store, attribute, range)->Request.onsuccess(event => {
    switch event->CursorEvent.cursor->Js.Nullable.toOption {
    | None => gather(None)
    | Some(cursor) => {
        gather(Some(cursor->Cursor.value))
        cursor->Cursor.continue
      }
    }
  })
}

let _anyOf = (store, attribute, values, gather) => {
  switch values {
  | [] => gather(None)
  | [value] => _simpleQuery(store, Is(attribute, value), gather)
  | values => {
      let values = values->Set.String.fromArray->Set.String.toArray->Js.Array2.sortInPlace
      let n_values = values->Array.length
      let lower = values->Array.getUnsafe(0)
      let upper = values->Array.getUnsafe(n_values - 1)
      let range = KeyRange.bound(lower, upper, false, false)
      let i = ref(0)
      _openCursor(store, Some(attribute), Some(range))->Request.onsuccess(event => {
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

let rec _query = (store: Store.t, expression: read<'a>, callback: array<'a> => unit) => {
  switch expression {
  | NoOp => callback([])
  | Get(id) | Is("id", id) => {
      let request = store->Store.get(id)
      request->Request.onsuccess(_ => {
        switch request->Request.result {
        | Some(item) => callback([item])
        | None => callback([])
        }
      })
    }
  | All | Is(_, _) | Lt(_, _) | Lte(_, _) | Gt(_, _) | Gte(_, _) | Between(_, _, _) => {
      let results = []
      let gather = item => {
        switch item {
        | Some(item) => results->Js.Array2.push(item)->ignore
        | None => callback(results)
        }
      }
      _simpleQuery(store, expression, gather)
    }
  | AnyOf(index, values) => {
      let results = []
      let gather = item => {
        switch item {
        | Some(item) => results->Js.Array2.push(item)->ignore
        | None => callback(results)
        }
      }
      _anyOf(store, index, values, gather)
    }
  | Filter(read, predicate) =>
    _query(store, read, results => {
      results->Array.keep(predicate)->callback
    })
  | And(left, right) => {
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
      _query(store, left, gather)
      _query(store, right, gather)
    }
  | Or(left, right) => {
      let results = Js.Dict.empty()
      let awaiting = ref(2)
      let gather = items => {
        items->Array.forEach(item => {results->Js.Dict.set(item["id"], item)})
        awaiting := awaiting.contents - 1
        if awaiting.contents == 0 {
          results->Js.Dict.values->callback
        }
      }
      _query(store, left, gather)
      _query(store, right, gather)
    }
  }
}

let _simplifyReadRequest = readRequest =>
  readRequest
  ->Js.Dict.entries
  ->Array.keepMap(((name, expression)) =>
    switch expression {
    | NoOp => None
    | _ => Some((name, expression))
    }
  )
  ->Js.Dict.fromArray

let _simplifyWriteRequest = writeRequest =>
  writeRequest
  ->Js.Dict.entries
  ->Array.keepMap(((name, commands)) =>
    switch commands {
    | [] => None
    | commands => Some((name, commands))
    }
  )
  ->Js.Dict.fromArray

let _read = (transaction, readRequest, response) => {
  Js.Promise.make((~resolve, ~reject) => {
    reject->ignore

    let toResolve = readRequest->Js.Dict.keys->Array.length
    let solved = ref(0)

    readRequest
    ->Js.Dict.entries
    ->Array.forEach(((storeName, expression)) => {
      let store = transaction->Transaction.objectStore(storeName)
      _query(store, expression, results => {
        response->Js.Dict.unsafeGet(store->Store.name)->Js.Array2.pushMany(results)->ignore
        solved := solved.contents + 1
        if solved.contents == toResolve {
          resolve(. response)
        }
      })
    })
  })
}

let _write = (transaction, writeRequest, response) => {
  Js.Promise.make((~resolve, ~reject) => {
    reject->ignore
    writeRequest
    ->Js.Dict.entries
    ->Array.forEach(((storeName, commands)) => {
      let store = transaction->Transaction.objectStore(storeName)
      commands->Array.forEach(command => {
        switch command {
        | Clear => store->Store.clear->ignore
        | Save(item) => store->Store.put(item)->ignore
        | Delete(id) => store->Store.delete(id)->ignore
        }
      })
    })
    resolve(. response)
  })
}

let _makeResponse = db => {
  db->Database.objectStoreNames->Array.map(name => (name, []))->Js.Dict.fromArray
}

let read = (db: Database.t, readRequest) => {
  let response = db->_makeResponse
  let simplifiedRequest = readRequest->_simplifyReadRequest
  switch simplifiedRequest->Js.Dict.keys {
  | [] => Js.Promise.resolve(response)
  | storeNames =>
    db->Database.transaction(storeNames, #readonly)->_read(simplifiedRequest, response)
  }
}

let write = (db: Database.t, writeRequest) => {
  let response = db->_makeResponse
  let simplifiedRequest = writeRequest->_simplifyWriteRequest
  switch simplifiedRequest->Js.Dict.keys {
  | [] => Js.Promise.resolve(response)
  | storeNames =>
    db->Database.transaction(storeNames, #readwrite)->_write(simplifiedRequest, response)
  }
}

let rec _executeQueries = (promise, queries, transaction) => {
  promise->Js.Promise.then_(response => {
    switch queries {
    | list{} => Js.Promise.resolve(response)
    | list{query, ...queries} =>
      switch query {
      | Read(q) => {
          let simplifiedRequest = response->q->_simplifyReadRequest
          switch simplifiedRequest->Js.Dict.keys {
          | [] => Js.Promise.resolve(response)
          | _ => transaction->_read(simplifiedRequest, response)
          }
        }
      | Write(q) => {
          let simplifiedRequest = response->q->_simplifyWriteRequest
          switch simplifiedRequest->Js.Dict.keys {
          | [] => Js.Promise.resolve(response)
          | _ => transaction->_write(simplifiedRequest, response)
          }
        }
      }->_executeQueries(queries, transaction)
    }
  }, _)
}

let do = (db: Database.t, queries: array<query<'a, 'b>>) => {
  let response = db->_makeResponse
  let transactionMode = if (
    queries->Array.some(query =>
      switch query {
      | Read(_) => false
      | Write(_) => true
      }
    )
  ) {
    #readwrite
  } else {
    #readonly
  }
  Js.Promise.make((~resolve, ~reject) => {
    reject->ignore
    let transaction = db->Database.transaction(db->Database.objectStoreNames, transactionMode)
    transaction->Transaction.oncomplete(() => resolve(. response))
    Js.Promise.resolve(response)->_executeQueries(queries->List.fromArray, transaction)->ignore
  })
}

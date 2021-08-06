open ReIndexed
open Belt

let uuid4: unit => string = %raw(`
  function () {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(
      /[018]/g,
      (c) => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }
`)

let ignore = _ => ()
let chooseFrom = choices => choices->Array.getUnsafe(Js.Math.random_int(0, choices->Array.length))
let then = (promise, function) => Js.Promise.then_(function, promise)
let catch = (promise, function) => Js.Promise.catch(function, promise)
let resolve = Js.Promise.resolve

module VesselDef = {
  type t = {id: string, name: string, age: int}
  type index = [#id | #name | #age]
}
module Vessel = MakeModel(VesselDef)

module StaffDef = {
  type position = [#shore | #crew]
  type t = {id: string, name: string, age: int, position: position}
  type index = [#id | #name | #age | #position]
}
module Staff = MakeModel(StaffDef)

module Database = MakeDatabase({
  let migrations = () => {
    open IDB.Migration
    [
      (db, _transaction): unit => {
        let store = db->Database.createObjectStore("vessels")
        store->Store.createIndex("name", "name")
        store->Store.createIndex("age", "age")
      },
      (db, _transaction): unit => {
        db->Utils.createStandardStore("staff", ["name", "age", "position"])->ignore
      },
    ]
  }
})

module QueryDef = {
  type request = {vessels: array<Vessel.action>, staff: array<Staff.action>}
  type response = {vessels: array<Vessel.t>, staff: array<Staff.t>}
  let make = (): request => {vessels: [], staff: []}
  let makeResponse = (): response => {vessels: [], staff: []}
}

module Query = Database.MakeQuery(QueryDef)

Database.connect("test_database")
->then(_db => {
  let vessels: array<Vessel.t> = [
    {id: "a", name: "MS Anag", age: 10},
    {id: "b", name: "MS Anag", age: 15},
    {id: "c", name: "MS Fresco", age: 5},
    {id: "d", name: "Mc Donald", age: 20},
    {id: "x", name: "Mc Donald", age: 15},
  ]

  open QUnit

  let setUp = done => {
    Js.log("before")

    {...Query.make(), vessels: [#clear]->Array.concat(vessels->Array.map(v => #save(v)))}
    ->Query.do
    ->then(results => {
      Js.log("result")
      done()
      resolve(results)
    })
  }

  module_("Base", hooks => {
    hooks->beforeEach(x => {
      x->timeout(10000)
      let done = x->async
      switch setUp(done) {
      | x => x->ignore
      | exception any => Js.log(("See me fail", any))
      }
    })

    test("Can read all the stored vessels", x => {
      let done = x->async
      Query.do({...Query.make(), vessels: [#query(#all)]})
      ->then((results: Query.response) => {
        x->equal(results.vessels->Array.length, 5, "There should be 5 vessels")
        x->deepEqual(results.vessels, vessels, "The vessels match the stored vessels")
        resolve(done())
      })
      ->ignore
    })

    test("Can delete all stored vessels at once", x => {
      let done = x->asyncMany(2)
      Query.do({...Query.make(), vessels: [#query(#all)]})
      ->then(results => {
        x->equal(results.vessels->Array.length, 5, "There should be 5 vessels")
        done()
        Query.do({...Query.make(), vessels: [#clear, #query(#all)]})
      })
      ->then(results => {
        x->equal(results.vessels->Array.length, 0, "There most be no vessels stored after 'clear'")
        done()
        resolve(results)
      })
      ->ignore
    })

    test("Can delete a single vessel by key", x => {
      let done = x->async
      {...Query.make(), vessels: [#delete("a"), #query(#all)]}
      ->Query.do
      ->then((results: Query.response) => {
        x->equal(results.vessels->Array.length, 4, "There should be just 4 vessels")
        x->isFalse(
          results.vessels->Array.some(vessel => vessel.id == "a"),
          "Non of the vessel has 'a' as id",
        )
        done()
        resolve()
      })
      ->ignore
    })

    test("Can retrieve a single vessel by key", x => {
      let done = x->async
      {...Query.make(), vessels: [#get("a")]}
      ->Query.do
      ->then((results: Query.response) => {
        x->equal(results.vessels->Array.length, 1, "There should be just 1 vessels")
        x->deepEqual(
          results.vessels->Array.get(0),
          Some({id: "a", name: "MS Anag", age: 10}),
          "The vessel retrieved should have id 'a'",
        )
        done()
        resolve()
      })
      ->ignore
    })

    test("Can add a new vessel", x => {
      let done = x->async
      {
        ...Query.make(),
        vessels: [#save({id: "new", name: "MS New", age: 30}), #query(#all)],
      }
      ->Query.do
      ->then((results: Query.response) => {
        x->equal(results.vessels->Array.length, 6, "There should be just 6 vessels")
        x->deepEqual(
          results.vessels->Array.keep(vessel => vessel.id == "new"),
          [{id: "new", name: "MS New", age: 30}],
          "The new vessel can be retrieved",
        )
        done()
        resolve()
      })
      ->ignore
    })

    let checkResultantKeys = (x, query, keys) => {
      let done = x->async
      {
        ...Query.make(),
        vessels: [query],
      }
      ->Query.do
      ->then((results: Query.response) => {
        let retrievedKeys = results.vessels->Array.map(vessel => vessel.id)->Js.Array.sortInPlace
        let keys = keys->Js.Array.sortInPlace
        x->deepEqual(retrievedKeys, keys, "Retrieved should keys match")
        done()
        resolve()
      })
      ->ignore
    }

    module_("Test term on primary key", _ => {
      test("Can get pricese primary key", x => {
        x->checkResultantKeys(#query(#is(#id, "c")), ["c"])
      })

      test("Can get less than primary key", x => {
        x->checkResultantKeys(#query(#lt(#id, "c")), ["a", "b"])
      })

      test("Can get less or equal than primary key", x => {
        x->checkResultantKeys(#query(#lte(#id, "c")), ["a", "b", "c"])
      })

      test("Can get grater than primary key", x => {
        x->checkResultantKeys(#query(#gt(#id, "c")), ["d", "x"])
      })

      test("Can get grater or equal than primary key", x => {
        x->checkResultantKeys(#query(#gte(#id, "c")), ["c", "d", "x"])
      })

      test("Can get a range with exclusive of keys", x => {
        x->checkResultantKeys(#query(#between(#id, #excl("b"), #excl("d"))), ["c"])
      })

      test("Can get a range left exclusive and right inclusive keys", x => {
        x->checkResultantKeys(#query(#between(#id, #excl("b"), #incl("d"))), ["c", "d"])
      })

      test("Can get a range left inclusive and right exclusive keys", x => {
        x->checkResultantKeys(#query(#between(#id, #incl("b"), #excl("d"))), ["b", "c"])
      })

      test("Can get a range of incluisive keys", x => {
        x->checkResultantKeys(#query(#between(#id, #incl("b"), #incl("d"))), ["b", "c", "d"])
      })
    })

    module_("Test term on an index", _ => {
      test("Can get pricese primary key", x => {
        x->checkResultantKeys(#query(#is(#age, Query.value(15))), ["b", "x"])
      })

      test("Can get less than primary key", x => {
        x->checkResultantKeys(#query(#lt(#age, Query.value(15))), ["c", "a"])
      })

      test("Can get less or equal than primary key", x => {
        x->checkResultantKeys(#query(#lte(#age, Query.value(15))), ["c", "a", "b", "x"])
      })

      test("Can get grater than primary key", x => {
        x->checkResultantKeys(#query(#gt(#age, Query.value(15))), ["d"])
      })

      test("Can get grater or equal than primary key", x => {
        x->checkResultantKeys(#query(#gte(#age, Query.value(15))), ["b", "x", "d"])
      })

      test("Can get a range with exclusive of keys", x => {
        x->checkResultantKeys(
          #query(#between(#age, #excl(Query.value(5)), #excl(Query.value(20)))),
          ["a", "b", "x"],
        )
      })

      test("Can get a range left exclusive and right inclusive keys", x => {
        x->checkResultantKeys(
          #query(#between(#age, #excl(Query.value(5)), #incl(Query.value(20)))),
          ["a", "b", "x", "d"],
        )
      })

      test("Can get a range left inclusive and right exclusive keys", x => {
        x->checkResultantKeys(
          #query(#between(#age, #incl(Query.value(5)), #excl(Query.value(20)))),
          ["c", "a", "b", "x"],
        )
      })

      test("Can get a range of incluisive keys", x => {
        x->checkResultantKeys(
          #query(#between(#age, #incl(Query.value(5)), #incl(Query.value(20)))),
          ["c", "a", "b", "x", "d"],
        )
      })
    })

    module_("Test filtering", _ => {
      test("Filtering over all items", x => {
        x->checkResultantKeys(#filter(#all, vessel => vessel.age == 15), ["b", "x"])
      })

      test("Filtering over previous selector items", x => {
        x->checkResultantKeys(#filter(#is(#name, "MS Anag"), vessel => vessel.age == 15), ["b"])
      })
    })

    module_("AND logic operator", _ => {
      test("Two queries over the same value result in empty", x => {
        x->checkResultantKeys(#query(#And(#is(#name, "MS Anag"), #is(#name, "MS Donald"))), [])
      })

      test("Two where one reduces the other one", x => {
        x->checkResultantKeys(
          #query(#And(#is(#name, "MS Anag"), #is(#age, Query.value(15)))),
          ["b"],
        )
      })
    })

    module_("OR logic operator", _ => {
      test("Two queries on oposite directions exclude the center", x => {
        x->checkResultantKeys(
          #query(#Or(#lt(#age, Query.value(15)), #gt(#age, Query.value(15)))),
          ["d", "c", "a"],
        )
      })
    })

    module_("anyOf operator", _ => {
      test("Quering a single item that is not present returns nothing", x => {
        x->checkResultantKeys(#query(#anyOf(#age, [Query.value(17)])), [])
      })

      test("Quering a on a single value can return multiple candidates", x => {
        x->checkResultantKeys(#query(#anyOf(#name, ["MS Anag"])), ["a", "b"])
      })

      test("Quering a on a multiple values returns multiple candidates", x => {
        x->checkResultantKeys(
          #query(#anyOf(#name, ["MS Anag", "Mc Donald", "MS Anag"])),
          ["a", "b", "d", "x"],
        )
      })

      test("Quering with in can be combined with logical operators", x => {
        x->checkResultantKeys(
          #query(#Or(#anyOf(#name, ["MS Anag", "Mc Donald"]), #anyOf(#age, [Query.value(5)]))),
          ["a", "b", "c", "d", "x"],
        )
      })
    })

    let checkRemainingItems = (x, query, expected) => {
      let done = x->async
      {
        ...Query.make(),
        vessels: [query, #query(#all)],
      }
      ->Query.do
      ->then((results: Query.response) => {
        x->deepEqual(results.vessels, expected, "Should match the remaining objects")
        done()
        resolve()
      })
      ->ignore
    }

    module_("Conditional update", _ => {
      test("If the predicate returns None nothing is updated", x => {
        x->checkRemainingItems(
          #updateWhen(#all, _vessel => {None}),
          [
            {id: "a", name: "MS Anag", age: 10},
            {id: "b", name: "MS Anag", age: 15},
            {id: "c", name: "MS Fresco", age: 5},
            {id: "d", name: "Mc Donald", age: 20},
            {id: "x", name: "Mc Donald", age: 15},
          ],
        )
      })

      test("If the the predicate returns Some(vessel) it is modified", x => {
        let done = x->asyncMany(2)
        {
          ...Query.make(),
          vessels: [
            #updateWhen(
              #all,
              vessel => {
                if vessel.name == "MS Anag" {
                  Some({...vessel, age: 0})
                } else {
                  None
                }
              },
            ),
          ],
        }
        ->Query.do
        ->then(_ => {
          done()
          {...Query.make(), vessels: [#query(#all)]}->Query.do
        })
        ->then(results => {
          x->deepEqual(
            results.vessels,
            [
              {id: "a", name: "MS Anag", age: 0},
              {id: "b", name: "MS Anag", age: 0},
              {id: "c", name: "MS Fresco", age: 5},
              {id: "d", name: "Mc Donald", age: 20},
              {id: "x", name: "Mc Donald", age: 15},
            ],
            "Vessels with name `MS Anag` shuold have age=0",
          )
          done()
          resolve()
        })
        ->ignore
      })
    })

    module_("Conditional deletion", _ => {
      test("Deleting the ones with `age = 15` should left the rest intact", x => {
        let done = x->asyncMany(2)
        {...Query.make(), vessels: [#deleteWhen(#is(#age, Query.value(15)))]}
        ->Query.do
        ->then(_ => {
          done()
          {...Query.make(), vessels: [#query(#all)]}->Query.do
        })
        ->then(results => {
          x->deepEqual(
            results.vessels,
            [
              {id: "a", name: "MS Anag", age: 10},
              {id: "c", name: "MS Fresco", age: 5},
              {id: "d", name: "Mc Donald", age: 20},
            ],
            "The ones with age!=15 should remain",
          )
          done()
          resolve()
        })
        ->ignore
      })
    })
  })

  module_("Performance test", _ => {
    test("Bulk insert of 10.000 items", x => {
      let names = ["MS Angst", "MS Angust", "Cachimba", "Record MSX", "VAX", "UNIVAC"]

      let vessels = Array.makeBy(10000, (_): Vessel.t => {
        id: uuid4(),
        name: chooseFrom(names),
        age: Js.Math.random_int(0, 100),
      })
      let done = x->asyncMany(3)
      let start = Js.Date.now()->Int.fromFloat
      {...Query.make(), vessels: vessels->Array.map(v => #save(v))}
      ->Query.do
      ->then(_ => {
        let afterInsert = Js.Date.now()->Int.fromFloat
        x->isTrue(true, `Insertion done in ${(afterInsert - start)->Int.toString}ms`)

        {...Query.make(), vessels: [#query(#all)]}
        ->Query.do
        ->then(_ => {
          let afterReadAll = Js.Date.now()->Int.fromFloat
          x->isTrue(true, `Read all done in ${(afterReadAll - afterInsert)->Int.toString}ms`)

          {...Query.make(), vessels: [#query(#is(#name, "Cachimba"))]}
          ->Query.do
          ->then(_ => {
            let readFromIndex = Js.Date.now()->Int.fromFloat
            x->isTrue(
              true,
              `Read from single index in ${(readFromIndex - afterReadAll)->Int.toString}ms`,
            )
            done()
            resolve()
          })
          ->ignore
          done()
          resolve()
        })
        ->ignore
        done()
        resolve()
      })
      ->ignore
    })
  })
  resolve()
})
->ignore

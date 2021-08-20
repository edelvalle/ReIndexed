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
  type t = {id: string, name: string, age: int, flag: option<string>}
  type index = [#id | #name | #age | #flag]
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
        store->Store.createIndex("flag", "flag")
      },
      (db, _transaction): unit => {
        db->Utils.createStandardStore("staff", ["name", "age", "position"])->ignore
      },
    ]
  }
})

module QueryDef = {
  type read = {vessels: Vessel.read, staff: Staff.read}
  type write = {vessels: Vessel.actions, staff: Staff.actions}
  type response = {vessels: array<Vessel.t>, staff: array<Staff.t>}

  let makeRead = (): read => {vessels: NoOp, staff: NoOp}
  let makeWrite = (): write => {vessels: [], staff: []}
}

module Query = Database.MakeQuery(QueryDef)

Database.connect("test_database")
->then(_db => {
  let vessels: array<Vessel.t> = [
    {id: "a", name: "MS Anag", age: 10, flag: None},
    {id: "b", name: "MS Anag", age: 15, flag: Some("de")},
    {id: "c", name: "MS Fresco", age: 5, flag: Some("au")},
    {id: "d", name: "Mc Donald", age: 20, flag: None},
    {id: "x", name: "Mc Donald", age: 15, flag: Some("de")},
  ]

  open QUnit

  let setUp = done => {
    Js.log("before")

    {
      ...Query.makeWrite(),
      vessels: [Vessel.Clear]->Array.concat(vessels->Array.map(v => Vessel.Save(v))),
    }
    ->Query.write
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
      {...Query.makeRead(), vessels: All}
      ->Query.read
      ->then(results => {
        x->equal(results.vessels->Array.length, 5, "There should be 5 vessels")
        x->deepEqual(results.vessels, vessels, "The vessels match the stored vessels")
        resolve(done())
      })
      ->ignore
    })

    test("Can delete all stored vessels at once", x => {
      let done = x->asyncMany(2)
      {...Query.makeRead(), vessels: All}
      ->Query.read
      ->then(results => {
        x->equal(results.vessels->Array.length, 5, "There should be 5 vessels")
        done()
        [
          Write(_ => {...Query.makeWrite(), vessels: [Clear]}),
          Read(_ => {...Query.makeRead(), vessels: All}),
        ]->Query.do
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
      [
        Write(_ => {...Query.makeWrite(), vessels: [Delete("a")]}),
        Read(_ => {...Query.makeRead(), vessels: All}),
      ]
      ->Query.do
      ->then(results => {
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
      {...Query.makeRead(), vessels: Get("a")}
      ->Query.read
      ->then((results: Query.response) => {
        x->equal(results.vessels->Array.length, 1, "There should be just 1 vessels")
        x->deepEqual(
          results.vessels->Array.get(0),
          Some({id: "a", name: "MS Anag", age: 10, flag: None}),
          "The vessel retrieved should have id 'a'",
        )
        done()
        resolve()
      })
      ->ignore
    })

    test("Can add a new vessel", x => {
      let done = x->async
      [
        Write(
          _ => {
            ...Query.makeWrite(),
            vessels: [Save({id: "new", name: "MS New", age: 30, flag: None})],
          },
        ),
        Read(_ => {...Query.makeRead(), vessels: All}),
      ]
      ->Query.do
      ->then(results => {
        x->equal(results.vessels->Array.length, 6, "There should be just 6 vessels")
        x->deepEqual(
          results.vessels->Array.keep(vessel => vessel.id == "new"),
          [{id: "new", name: "MS New", age: 30, flag: None}],
          "The new vessel can be retrieved",
        )
        done()
        resolve()
      })
      ->ignore
    })

    let checkResultantKeys = (x, query, keys) => {
      let done = x->async
      {...Query.makeRead(), vessels: query}
      ->Query.read
      ->then(results => {
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
        x->checkResultantKeys(Is(#id, "c"), ["c"])
      })

      test("Can get many vessels with In", x => {
        x->checkResultantKeys(In(["a", "c", "this-doesnt-exists"]), ["a", "c"])
      })

      test("Can get less than primary key", x => {
        x->checkResultantKeys(Lt(#id, "c"), ["a", "b"])
      })

      test("Can get less or equal than primary key", x => {
        x->checkResultantKeys(Lte(#id, "c"), ["a", "b", "c"])
      })

      test("Can get grater than primary key", x => {
        x->checkResultantKeys(Gt(#id, "c"), ["d", "x"])
      })

      test("Can get grater or equal than primary key", x => {
        x->checkResultantKeys(Gte(#id, "c"), ["c", "d", "x"])
      })

      test("Can get a range with exclusive of keys", x => {
        x->checkResultantKeys(Between(#id, Excl("b"), Excl("d")), ["c"])
      })

      test("Can get a range left exclusive and right inclusive keys", x => {
        x->checkResultantKeys(Between(#id, Excl("b"), Incl("d")), ["c", "d"])
      })

      test("Can get a range left inclusive and right exclusive keys", x => {
        x->checkResultantKeys(Between(#id, Incl("b"), Excl("d")), ["b", "c"])
      })

      test("Can get a range of incluisive keys", x => {
        x->checkResultantKeys(Between(#id, Incl("b"), Incl("d")), ["b", "c", "d"])
      })
    })

    module_("Test term on an index", _ => {
      test("Can read not null flags", x => {
        x->checkResultantKeys(NotNull(#flag), ["b", "c", "x"])
      })

      test("Can get pricese primary key", x => {
        x->checkResultantKeys(Is(#age, Query.value(15)), ["b", "x"])
      })

      test("Can get less than primary key", x => {
        x->checkResultantKeys(Lt(#age, Query.value(15)), ["c", "a"])
      })

      test("Can get less or equal than primary key", x => {
        x->checkResultantKeys(Lte(#age, Query.value(15)), ["c", "a", "b", "x"])
      })

      test("Can get grater than primary key", x => {
        x->checkResultantKeys(Gt(#age, Query.value(15)), ["d"])
      })

      test("Can get grater or equal than primary key", x => {
        x->checkResultantKeys(Gte(#age, Query.value(15)), ["b", "x", "d"])
      })

      test("Can get a range with exclusive of keys", x => {
        x->checkResultantKeys(
          Between(#age, Excl(Query.value(5)), Excl(Query.value(20))),
          ["a", "b", "x"],
        )
      })

      test("Can get a range left exclusive and right inclusive keys", x => {
        x->checkResultantKeys(
          Between(#age, Excl(Query.value(5)), Incl(Query.value(20))),
          ["a", "b", "x", "d"],
        )
      })

      test("Can get a range left inclusive and right exclusive keys", x => {
        x->checkResultantKeys(
          Between(#age, Incl(Query.value(5)), Excl(Query.value(20))),
          ["c", "a", "b", "x"],
        )
      })

      test("Can get a range of incluisive keys", x => {
        x->checkResultantKeys(
          Between(#age, Incl(Query.value(5)), Incl(Query.value(20))),
          ["c", "a", "b", "x", "d"],
        )
      })
    })

    module_("Test filtering", _ => {
      test("Filtering over all items", x => {
        x->checkResultantKeys(Filter(All, vessel => vessel.age == 15), ["b", "x"])
      })

      test("Filtering over previous selector items", x => {
        x->checkResultantKeys(Filter(Is(#name, "MS Anag"), vessel => vessel.age == 15), ["b"])
      })
    })

    module_("AND logic operator", _ => {
      test("Two queries over the same value result in empty", x => {
        x->checkResultantKeys(And(Is(#name, "MS Anag"), Is(#name, "MS Donald")), [])
      })

      test("Two where one reduces the other one", x => {
        x->checkResultantKeys(And(Is(#name, "MS Anag"), Is(#age, Query.value(15))), ["b"])
      })
    })

    module_("OR logic operator", _ => {
      test("Two queries on oposite directions exclude the center", x => {
        x->checkResultantKeys(
          Or(Lt(#age, Query.value(15)), Gt(#age, Query.value(15))),
          ["d", "c", "a"],
        )
      })
    })

    module_("anyOf operator", _ => {
      test("Quering a single item that is not present returns nothing", x => {
        x->checkResultantKeys(AnyOf(#age, [Query.value(17)]), [])
      })

      test("Quering a on a single value can return multiple candidates", x => {
        x->checkResultantKeys(AnyOf(#name, ["MS Anag"]), ["a", "b"])
      })

      test("Quering a on a multiple values returns multiple candidates", x => {
        x->checkResultantKeys(
          AnyOf(#name, ["MS Anag", "Mc Donald", "MS Anag"]),
          ["a", "b", "d", "x"],
        )
      })

      test("Quering with in can be combined with logical operators", x => {
        x->checkResultantKeys(
          Or(AnyOf(#name, ["MS Anag", "Mc Donald"]), AnyOf(#age, [Query.value(5)])),
          ["a", "b", "c", "d", "x"],
        )
      })
    })

    let checkRemainingItems = (query, x, expected) => {
      let done = x->asyncMany(2)
      query
      ->then(_ => {
        done()
        {...Query.makeRead(), vessels: All}->Query.read
      })
      ->then(results => {
        x->deepEqual(results.vessels, expected, "Should match the remaining objects")
        done()
        resolve()
      })
      ->ignore
    }

    module_("Conditional update", _ => {
      test("If the predicate returns None nothing is updated", x => {
        [
          Read(_ => {...Query.makeRead(), vessels: All}),
          Write(
            ({vessels}) => {
              ...Query.makeWrite(),
              vessels: vessels->Array.keepMap(vessel =>
                if vessel.age == 100 {
                  Some(Vessel.Save({...vessel, age: 0}))
                } else {
                  None
                }
              ),
            },
          ),
        ]
        ->Query.do
        ->checkRemainingItems(
          x,
          [
            {id: "a", name: "MS Anag", age: 10, flag: None},
            {id: "b", name: "MS Anag", age: 15, flag: Some("de")},
            {id: "c", name: "MS Fresco", age: 5, flag: Some("au")},
            {id: "d", name: "Mc Donald", age: 20, flag: None},
            {id: "x", name: "Mc Donald", age: 15, flag: Some("de")},
          ],
        )
      })

      test("If the the predicate returns Some(vessel) it is modified", x => {
        [
          Read(_ => {...Query.makeRead(), vessels: Is(#name, "MS Anag")}),
          Write(
            ({vessels}) => {
              ...Query.makeWrite(),
              vessels: vessels->Array.map(vessel => Vessel.Save({...vessel, age: 0})),
            },
          ),
        ]
        ->Query.do
        ->checkRemainingItems(
          x,
          [
            {id: "a", name: "MS Anag", age: 0, flag: None},
            {id: "b", name: "MS Anag", age: 0, flag: Some("de")},
            {id: "c", name: "MS Fresco", age: 5, flag: Some("au")},
            {id: "d", name: "Mc Donald", age: 20, flag: None},
            {id: "x", name: "Mc Donald", age: 15, flag: Some("de")},
          ],
        )
      })

      test("Deleting the ones with `age = 15` should left the rest intact", x => {
        [
          Read(_ => {...Query.makeRead(), vessels: Is(#age, Query.value(15))}),
          Write(
            ({vessels}) => {
              ...Query.makeWrite(),
              vessels: vessels->Array.map(vessel => Vessel.Delete(vessel.id)),
            },
          ),
        ]
        ->Query.do
        ->checkRemainingItems(
          x,
          [
            {id: "a", name: "MS Anag", age: 10, flag: None},
            {id: "c", name: "MS Fresco", age: 5, flag: Some("au")},
            {id: "d", name: "Mc Donald", age: 20, flag: None},
          ],
        )
      })
    })
  })

  module_("Performance test", _ => {
    let names = ["MS Angst", "MS Angust", "Cachimba", "Record MSX", "VAX", "UNIVAC"]
    let flags = [None, Some("de"), Some("cu"), Some("ch"), Some("au"), Some("tk")]

    test("Bulk insert of 10.000 items", x => {
      let vessels = Array.makeBy(10000, (_): Vessel.t => {
        id: uuid4(),
        name: chooseFrom(names),
        age: Js.Math.random_int(0, 100),
        flag: chooseFrom(flags),
      })
      let done = x->asyncMany(3)
      let start = Js.Date.now()->Int.fromFloat
      {...Query.makeWrite(), vessels: vessels->Array.map(v => Vessel.Save(v))}
      ->Query.write
      ->then(_ => {
        let afterInsert = Js.Date.now()->Int.fromFloat
        x->isTrue(true, `Insertion done in ${(afterInsert - start)->Int.toString}ms`)
        done()

        {...Query.makeRead(), vessels: All}
        ->Query.read
        ->then(_ => {
          let afterReadAll = Js.Date.now()->Int.fromFloat
          x->isTrue(true, `Read all done in ${(afterReadAll - afterInsert)->Int.toString}ms`)
          done()

          {...Query.makeRead(), vessels: Is(#name, "Cachimba")}
          ->Query.read
          ->then(_ => {
            let readFromIndex = Js.Date.now()->Int.fromFloat
            x->isTrue(
              true,
              `Read from single index in ${(readFromIndex - afterReadAll)->Int.toString}ms`,
            )
            done()
            resolve()
          })
        })
      })
      ->ignore
    })

    test("Bulk insert of 10.000 using chaining", x => {
      let vessels = Array.makeBy(10000, (_): Vessel.t => {
        id: uuid4(),
        name: chooseFrom(names),
        age: Js.Math.random_int(0, 100),
        flag: chooseFrom(flags),
      })
      let done = x->async
      [
        Write(_ => {...Query.makeWrite(), vessels: vessels->Array.map(v => Vessel.Save(v))}),
        Read(_ => {...Query.makeRead(), vessels: All}),
        Read(_ => {...Query.makeRead(), vessels: Is(#name, "Cachimba")}),
      ]
      ->Query.do
      ->then(_ => {
        done()
        x->isTrue(true, "Finished")
        resolve()
      })
      ->ignore
    })
  })

  resolve()
})
->ignore

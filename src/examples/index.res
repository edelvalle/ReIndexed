open ReInxed

module DatabaseDef = {
  type table = [#vessels]
  let migrations = () => {
    open IDB.Migration
    [
      (db, _transaction): unit => {
        let store = db->Database.createObjectStore("vessels")
        store->Store.createIndex("name", "name")
        store->Store.createIndex("age", "age")
      },
    ]
  }
}
module Database = MakeDatabase(DatabaseDef)

module VesselDef = {
  type t = {id: string, name: string, age: int}
  type attribute = [#id | #name | #age]
  let table: Database.table = #vessels
}
module Vessel = Database.MakeModel(VesselDef)

module QueryDef = {
  let connection = Database.connection
  type request = {vessels: array<Vessel.action>}
  type response = {vessels: array<Vessel.t>}
  let make = (): request => {vessels: []}
  let makeResponse = (): response => {vessels: []}
}

module Query = Database.MakeQuery(QueryDef)

let _ = Database.connect("shipping")->Js.Promise.then_(_db => {
  let vessels: array<Vessel.t> = [
    {id: "a", name: "MS Anag", age: 10},
    {id: "b", name: "MS Anag", age: 15},
    {id: "c", name: "Mc Donald", age: 20},
    {id: "x", name: "Mc Donald", age: 15},
  ]
  Query.do({vessels: Vessel.save(vessels)})->Js.Promise.then_(_response => {
    let _ = Query.do({
      vessels: Vessel.query(#Or(#is(#name, "MS Anag"), #lte(#age, Query.value(15)))),
    })->Js.Promise.then_(response => {
      Js.log(response)
      Js.Promise.resolve()
    }, _)
    Js.Promise.resolve()
  }, _)
}, _)

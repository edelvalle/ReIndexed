open Belt

open ReInxeded

module DatabaseDef = {
  type table = [#vessels]
  let migrations = () => {
    open IDB.Migration
    [
      (db, _transaction): unit => {
        db->Database.createObjectStore("vessels")->Store.createIndex("name", ["name"])
      },
      (_db, transaction): unit => {
        transaction->Transaction.objectStore("vessels")->Store.deleteIndex("name")
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
  let request: Query.request = {
    vessels: Vessel.save([{id: "totoro", name: "MS tororo", age: 19}])->Array.concat(
      Vessel.deleteMany(["vid"]),
    ),
  }
  request->Query.do->Js.Promise.then_(response => {Js.Promise.resolve(Js.log(response))}, _)
}, _)

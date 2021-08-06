open Belt

module type ModelT = {
  type t
  type index
}

module MakeModel = (Model: ModelT) => {
  type t = Model.t
  type index = Model.index
  type value = string
  type bound = [#incl(value) | #excl(value)]
  type rec expression = [
    | #all
    | #is(index, value)
    | #lt(index, value)
    | #lte(index, value)
    | #gt(index, value)
    | #gte(index, value)
    | #between(index, bound, bound)
    | #anyOf(index, array<value>)
    | #And(expression, expression)
    | #Or(expression, expression)
  ]

  type action = [
    | #get(value)
    | #delete(value)
    | #save(t)
    | #filter(expression, t => bool)
    | #query(expression)
    | #updateWhen(expression, t => option<t>)
    | #deleteWhen(expression)
    | #clear
  ]
  type actions = array<action>
}

module type DatabaseT = {
  let migrations: unit => array<IDB.Migration.t>
}

module MakeDatabase = (Database: DatabaseT) => {
  // database & migrations
  type connection = {mutable db: option<IDB.Database.t>}
  let connection = {db: None}
  let connect = name => {
    let migrations = Database.migrations()
    let upgrade = (db, oldVersion, newVersion, transaction) => {
      Js.log4("Migrating from version", oldVersion, "to", newVersion)
      migrations
      ->Array.slice(~offset=oldVersion, ~len=newVersion - oldVersion)
      ->Array.forEach(migration => migration(db, transaction))
    }
    IDB.Database.connect(name, migrations->Array.length, upgrade)->Js.Promise.then_(db => {
      connection.db = Some(db)
      Js.Promise.resolve(db)
    }, _)
  }

  // let do: (IDB.Database.t, 'a) =>

  module type QueryI = {
    type request
    type response
    let make: unit => request
    let makeResponse: unit => response
  }
  module MakeQuery = (Query: QueryI) => {
    type request = Query.request
    type response = Query.response

    external requestToDict: request => Js.Dict.t<array<'a>> = "%identity"
    external dictToResponse: Js.Dict.t<array<'a>> => response = "%identity"

    let make = Query.make
    external value: 'a => string = "%identity"
    let do = (request: request): Js.Promise.t<response> => {
      switch connection.db {
      | Some(db) =>
        db
        ->ReIndexed__Transaction.execute(request->requestToDict)
        ->Js.Promise.then_(response => response->dictToResponse->Js.Promise.resolve, _)
      | None =>
        Js.Promise.make((~resolve, ~reject) => {
          let _ = reject
          resolve(. Query.makeResponse())
        })
      }
    }
  }
}

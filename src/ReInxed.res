open Belt

type connection = {mutable db: option<IDB.Database.t>}

module type DatabaseT = {
  type table
  // type request
  // type response
  let migrations: unit => array<IDB.Migration.t>
}

module MakeDatabase = (Database: DatabaseT) => {
  // database & migrations
  type table = Database.table

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

  module type ModelT = {
    type t
    type attribute
    let table: Database.table
  }

  module MakeModel = (Model: ModelT) => {
    type t = Model.t
    type attribute = Model.attribute
    type value = string
    type bound = [#incl(value) | #excl(value)]
    type rec expression = [
      | #is(attribute, value)
      | #lt(attribute, value)
      | #lte(attribute, value)
      | #gt(attribute, value)
      | #gte(attribute, value)
      | #between(attribute, bound, bound)
      | #And(expression, expression)
      | #Or(expression, expression)
    ]

    type action = [
      | #get(value)
      | #delete(value)
      | #save(t)
      | #query(expression)
      | #updateQuery(expression, t => t)
      | #deleteQuery(expression)
    ]
    type actions = array<action>

    let save = (instances: array<t>): actions => instances->Array.map(x => #save(x))
    let get = (id): actions => [#get(id)]
    let getMany = (ids): actions => ids->Array.map(id => #get(id))
    let delete = (id): actions => [#delete(id)]
    let deleteMany = (ids): actions => ids->Array.map(id => #delete(id))
    let query = (expression): actions => [#query(expression)]
  }

  module type QueryI = {
    type request
    type response
    let connection: connection
    let make: unit => request
    let makeResponse: unit => response
  }
  module MakeQuery = (Query: QueryI) => {
    type request = Query.request
    type response = Query.response
    let make = Query.make
    external value: 'a => string = "%identity"
    let do = (request: request): Js.Promise.t<response> => {
      switch connection.db {
      | Some(db) => db->IDB.Database.transaction(request)
      | None =>
        Js.Promise.make((~resolve, ~reject) => {
          let _ = reject
          resolve(. Query.makeResponse())
        })
      }
    }
  }
}

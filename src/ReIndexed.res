open Belt

external value: 'a => string = "%identity"

module type ModelT = {
  type t
  type index
}

module MakeModel = (Model: ModelT) => {
  type t = Model.t
  type index = Model.index
  type value = string
  type bound =
    | Incl(value)
    | Excl(value)

  type rec read =
    | NoOp
    | All
    | Get(value)
    | NotNull(index)
    | Is(index, value)
    | Lt(index, value)
    | Lte(index, value)
    | Gt(index, value)
    | Gte(index, value)
    | Between(index, bound, bound)
    | AnyOf(index, array<value>)
    | In(array<value>)
    | Filter(read, t => bool)
    | And(read, read)
    | Or(read, read)

  type write =
    | Clear
    | Save(t)
    | Delete(value)

  type actions = array<write>
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

  module type QueryI = {
    type read
    type write
    type response
    let makeRead: unit => read
    let makeWrite: unit => write
  }
  module MakeQuery = (Query: QueryI) => {
    type read = Query.read
    type write = Query.write
    type response = Query.response
    type query =
      | Read(response => read)
      | Write(response => write)

    type queries = array<query>

    let makeRead = Query.makeRead
    let makeWrite = Query.makeWrite

    external readToDict: read => Js.Dict.t<ReIndexed_Transaction.read<'a>> = "%identity"
    external writeToDict: write => Js.Dict.t<array<ReIndexed_Transaction.write<'a>>> = "%identity"
    external dictToResponse: Js.Dict.t<array<'a>> => response = "%identity"
    external transformQueries: queries => array<ReIndexed_Transaction.query<'a, 'b>> = "%identity"
    let value = value

    let _withDb = f =>
      switch connection.db {
      | Some(db) => db->f
      | None =>
        Js.Promise.make((~resolve, ~reject) => {
          resolve->ignore
          reject(. Js.Exn.raiseError("The database is not connected"))
        })
      }

    let read = read =>
      _withDb(db =>
        db
        ->ReIndexed_Transaction.read(read->readToDict)
        ->Js.Promise.then_(response => response->dictToResponse->Js.Promise.resolve, _)
      )

    let write = write =>
      _withDb(db =>
        db
        ->ReIndexed_Transaction.write(write->writeToDict)
        ->Js.Promise.then_(response => response->dictToResponse->Js.Promise.resolve, _)
      )

    let do = (queries: queries): Js.Promise.t<response> => {
      _withDb(db =>
        db
        ->ReIndexed_Transaction.do(queries->transformQueries)
        ->Js.Promise.then_(response => response->dictToResponse->Js.Promise.resolve, _)
      )
    }
  }
}

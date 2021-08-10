module Migration = {
  module Store = {
    type t

    @send external deleteIndex: (t, string) => unit = "deleteIndex"

    @send external createIndex: (t, string, string) => unit = "createIndex"
    let createUniqueIndex: (t, string, array<string>) => unit = %raw(`
      function (store, name, attrPath) {
        store.createIndex(name, attrPath, {unique: true});
      }
    `)
    let createMultiEntryIndex: (t, string, array<string>) => unit = %raw(`
      function (store, name, attrPath) {
        store.createIndex(name, attrPath, {multiEntry: true});
      }
    `)
  }

  module Transaction = {
    type t
    @send external objectStore: (t, string) => Store.t = "objectStore"
  }

  module Database = {
    type t
    type oldVersion = int
    type newVersion = int

    let createObjectStore: (t, string) => Store.t = %raw(`
      function (database, name) {
        return database.createObjectStore(name, {"keyPath": "id"});
      }
    `)

    @send external deleteObjectStore: (t, string) => unit = "deleteObjectStore"
  }

  /// Utilities to "standard" migrations
  module Utils = {
    /// Calls `createIndex(a, a)` for each item in the array.
    let createManyIndexes = (obj: Store.t, indexes: array<string>): Store.t => {
      indexes->Js.Array2.forEach(a => obj->Store.createIndex(a, a))
      obj
    }

    /// Creates a store with a `name` in the given `db` and calls
    /// `createManyIndexes` afterwards.
    let createStandardStore = (db: Database.t, name: string, indexes: array<string>): Store.t => {
      db->Database.createObjectStore(name)->createManyIndexes(indexes)
    }
  }

  type t = (Database.t, Transaction.t) => unit
}

module Cursor = {
  type t
  @get external value: t => 'value = "value"
  @get external key: t => 'key = "key"
  @send external continue: t => unit = "continue"
  @send external continueTo: (t, 'a) => unit = "continue"
}

module CursorEvent = {
  type t
  @get @scope("target") external cursor: t => Js.Nullable.t<Cursor.t> = "result"
}

module Request = {
  type t
  @set external onsuccess: (t, CursorEvent.t => unit) => unit = "onsuccess"
  @get external result: t => option<'a> = "result"
}

module KeyRange = {
  type t
  @val @scope("IDBKeyRange") external only: 'a => t = "only"
  @val @scope("IDBKeyRange") external upperBound: ('a, bool) => t = "upperBound"
  @val @scope("IDBKeyRange") external lowerBound: ('a, bool) => t = "lowerBound"
  @val @scope("IDBKeyRange") external bound: ('a, 'a, bool, bool) => t = "bound"
}

module Index = {
  type t
  @send external openCursor: (t, option<KeyRange.t>) => Request.t = "openCursor"
}

module Store = {
  type t
  @get external keyPath: t => string = "keyPath"
  @get external name: t => string = "name"
  @send external put: (t, 'a) => Request.t = "put"
  @send external get: (t, string) => Request.t = "get"
  @send external delete: (t, string) => Request.t = "delete"
  @send external clear: t => Request.t = "clear"
  @send external index: (t, string) => Index.t = "index"
  @send external openCursor: (t, option<KeyRange.t>) => Request.t = "openCursor"
}

module Transaction = {
  type t
  @send external objectStore: (t, string) => Store.t = "objectStore"
  @set external oncomplete: (t, unit => unit) => unit = "oncomplete"
}

module Database = {
  type t
  let connect: (
    string,
    int,
    (
      Migration.Database.t,
      Migration.Database.oldVersion,
      Migration.Database.newVersion,
      Migration.Transaction.t,
    ) => unit,
  ) => Js.Promise.t<t> = %raw(`
    function(name, version, upgrade) {
      return new Promise((resolve, reject) => {
        var request = indexedDB.open(name, version);
        request.onupgradeneeded = (event) => {
          var db = event.target.result;
          upgrade(db, event.oldVersion, version, request.transaction);
        };
        request.onsuccess = (event) => {
          var db = event.target.result;
          resolve(db);
        };
        request.onerror = (event) => {
          reject();
        }
      });
    }
  `)

  type transactionMode = [#readwrite | #readonly]
  @send external transaction: (t, array<string>, transactionMode) => Transaction.t = "transaction"

  @get external objectStoreNames: t => array<string> = "objectStoreNames"
}

module Migration = {
  module Store = {
    type t

    @send external deleteIndex: (t, string) => unit = "deleteIndex"

    @send external createIndex: (t, string, array<string>) => unit = "createIndex"
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

  type t = (Database.t, Transaction.t) => unit
}

module Store = {
  type t
  @send external put: (t, 'a) => unit = "put"
}

module Transaction = {
  type t
  @send external objectStore: (t, string) => Store.t = "objectStore"
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
        var request = window.indexedDB.open(name, version);
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

  @module("./transaction") external transaction: 'a = "default"
}

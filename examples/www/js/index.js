(() => {
  var __defProp = Object.defineProperty;
  var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[Object.keys(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[Object.keys(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    __markAsModule(target);
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // lib/js/src/transaction.js
  var transaction_exports = {};
  __export(transaction_exports, {
    default: () => transaction_default
  });
  function transaction(db, requests) {
    let response = {};
    Object.keys(requests).map((storeName) => response[storeName] = []);
    let storeCommands = Object.entries(requests).map((storeCommand) => {
      let [storeName, commands] = storeCommand;
      commands = commands.map((command) => {
        return typeof command === "string" ? { NAME: command } : command;
      });
      return { storeName, commands };
    });
    return new Promise((resolve) => {
      let storesNames = getTransactionStores(storeCommands);
      if (storesNames.length == 0) {
        resolve(response);
        return;
      }
      let transaction2 = db.transaction(storesNames, getTransactionMode(storeCommands));
      transaction2.oncomplete = () => resolve(response);
      storeCommands.forEach(({ storeName, commands }) => {
        let store = transaction2.objectStore(storeName);
        commands.map(({ NAME, VAL }) => {
          switch (NAME) {
            case "get":
              let request = store.get(VAL);
              request.onsuccess = () => {
                if (!isUndefined(request.result))
                  response[store.name].push(request.result);
              };
              break;
            case "save":
              store.put(VAL);
              break;
            case "delete":
              store.delete(VAL);
              break;
            case "clear":
              store.clear();
              break;
            case "filter":
              let [expression, predicate] = VAL;
              query(store, expression, (results) => {
                response[store.name].push(...results);
              }, predicate);
            case "query":
              query(store, VAL, (results) => {
                response[store.name].push(...results);
              });
              break;
            case "updateWhen": {
              let [expression2, transformation] = VAL;
              query(store, expression2, (results) => results.map(transformation).filter((item) => !isUndefined(item)).forEach((item) => store.put(item)));
              break;
            }
            case "deleteWhen": {
              query(store, VAL, (results) => {
                results.forEach(({ id }) => store.delete(id));
              });
              break;
            }
            default:
              throw Error(`I don't know this command ${NAME}`);
          }
        });
      });
    });
  }
  function getTransactionStores(storeCommands) {
    return storeCommands.filter(({ commands }) => commands.length).map(({ storeName }) => storeName);
  }
  function getTransactionMode(storeCommand) {
    const isWriteTransaction = storeCommand.some(({ commands }) => commands.some(({ NAME }) => transactionWriteOps.has(NAME)));
    return isWriteTransaction ? "readwrite" : "readonly";
  }
  function query(store, expression, callback, predicate) {
    let { NAME, VAL } = expression;
    if (typeof expression === "string") {
      NAME = expression;
      VAL = [];
    }
    predicate = predicate ? predicate : (_) => true;
    if (simpleQueries.has(NAME)) {
      let results = [];
      let gather = (item) => {
        if (!isUndefined(item)) {
          results.push(item);
        } else {
          callback(results);
        }
      };
      simpleQuery(store, { NAME, VAL }, gather, predicate);
    } else if (NAME === "And") {
      let [left, right] = VAL;
      let resultCounter = {};
      let results = {};
      let awaiting = 2;
      let gather = (items) => {
        items.forEach((item) => {
          resultCounter[item.id] = (resultCounter[item.id] || 0) + 1;
          results[item.id] = item;
        });
        awaiting -= 1;
        if (awaiting === 0) {
          let finalResults = [];
          for (const [id, counter] of Object.entries(resultCounter)) {
            if (counter === 2) {
              finalResults.push(results[id]);
            }
          }
          callback(finalResults);
        }
      };
      query(store, left, gather, predicate);
      query(store, right, gather, predicate);
    } else if (NAME === "Or") {
      let [left, right] = VAL;
      let results = {};
      let awaiting = 2;
      let gather = (items) => {
        items.forEach((item) => {
          results[item.id] = item;
        });
        awaiting -= 1;
        if (awaiting === 0) {
          callback(Object.values(results));
        }
      };
      query(store, left, gather, predicate);
      query(store, right, gather, predicate);
    }
  }
  function simpleQuery(store, { NAME, VAL }, gather, predicate) {
    let [attribute, ...values] = VAL;
    let range = (() => {
      switch (NAME) {
        case "all":
          return void 0;
        case "is":
          return IDBKeyRange.only(values[0]);
        case "lt":
          return IDBKeyRange.upperBound(values[0], true);
        case "lte":
          return IDBKeyRange.upperBound(values[0]);
        case "gt":
          return IDBKeyRange.lowerBound(values[0], true);
        case "gte":
          return IDBKeyRange.lowerBound(values[0]);
        case "between":
          let [lower, upper] = values;
          return IDBKeyRange.bound(lower.VAL, upper.VAL, lower.NAME === "excl", upper.NAME === "excl");
      }
    })();
    openCursor(store, attribute, range).onsuccess = (event) => {
      let cursor = event.target.result;
      if (cursor) {
        if (predicate(cursor.value)) {
          gather(cursor.value);
        }
        cursor.continue();
      } else {
        gather();
      }
    };
  }
  function openCursor(store, attribute, range) {
    let index = isUndefined(attribute) || attribute == store.keyPath ? store : store.index(attribute);
    return index.openCursor(range);
  }
  function isUndefined(value) {
    return typeof value === "undefined";
  }
  var transactionWriteOps, simpleQueries, transaction_default;
  var init_transaction = __esm({
    "lib/js/src/transaction.js"() {
      transactionWriteOps = new Set(["save", "delete", "updateWhen", "deleteWhen", "clear"]);
      simpleQueries = new Set([
        "all",
        "is",
        "lt",
        "lte",
        "gt",
        "gte",
        "between"
      ]);
      transaction_default = transaction;
    }
  });

  // lib/js/src/IDB.js
  var require_IDB = __commonJS({
    "lib/js/src/IDB.js"(exports) {
      "use strict";
      var Transaction = (init_transaction(), transaction_exports).default;
      var createUniqueIndex = function(store, name, attrPath) {
        store.createIndex(name, attrPath, { unique: true });
      };
      var createMultiEntryIndex = function(store, name, attrPath) {
        store.createIndex(name, attrPath, { multiEntry: true });
      };
      var Store = {
        createUniqueIndex,
        createMultiEntryIndex
      };
      var Transaction$1 = {};
      var createObjectStore = function(database, name) {
        return database.createObjectStore(name, { "keyPath": "id" });
      };
      var Database = {
        createObjectStore
      };
      var Migration = {
        Store,
        Transaction: Transaction$1,
        Database
      };
      var Store$1 = {};
      var Transaction$2 = {};
      var connect = function(name, version, upgrade) {
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
          };
        });
      };
      var transaction2 = Transaction;
      var Database$1 = {
        connect,
        transaction: transaction2
      };
      exports.Migration = Migration;
      exports.Store = Store$1;
      exports.Transaction = Transaction$2;
      exports.Database = Database$1;
    }
  });

  // node_modules/rescript/lib/js/caml_array.js
  var require_caml_array = __commonJS({
    "node_modules/rescript/lib/js/caml_array.js"(exports) {
      "use strict";
      function sub(x, offset, len2) {
        var result = new Array(len2);
        var j = 0;
        var i = offset;
        while (j < len2) {
          result[j] = x[i];
          j = j + 1 | 0;
          i = i + 1 | 0;
        }
        ;
        return result;
      }
      function len(_acc, _l) {
        while (true) {
          var l = _l;
          var acc = _acc;
          if (!l) {
            return acc;
          }
          _l = l.tl;
          _acc = l.hd.length + acc | 0;
          continue;
        }
        ;
      }
      function fill(arr, _i, _l) {
        while (true) {
          var l = _l;
          var i = _i;
          if (!l) {
            return;
          }
          var x = l.hd;
          var l$1 = x.length;
          var k = i;
          var j = 0;
          while (j < l$1) {
            arr[k] = x[j];
            k = k + 1 | 0;
            j = j + 1 | 0;
          }
          ;
          _l = l.tl;
          _i = k;
          continue;
        }
        ;
      }
      function concat(l) {
        var v = len(0, l);
        var result = new Array(v);
        fill(result, 0, l);
        return result;
      }
      function set(xs, index, newval) {
        if (index < 0 || index >= xs.length) {
          throw {
            RE_EXN_ID: "Invalid_argument",
            _1: "index out of bounds",
            Error: new Error()
          };
        }
        xs[index] = newval;
      }
      function get(xs, index) {
        if (index < 0 || index >= xs.length) {
          throw {
            RE_EXN_ID: "Invalid_argument",
            _1: "index out of bounds",
            Error: new Error()
          };
        }
        return xs[index];
      }
      function make(len2, init) {
        var b = new Array(len2);
        for (var i = 0; i < len2; ++i) {
          b[i] = init;
        }
        return b;
      }
      function make_float(len2) {
        var b = new Array(len2);
        for (var i = 0; i < len2; ++i) {
          b[i] = 0;
        }
        return b;
      }
      function blit(a1, i1, a2, i2, len2) {
        if (i2 <= i1) {
          for (var j = 0; j < len2; ++j) {
            a2[j + i2 | 0] = a1[j + i1 | 0];
          }
          return;
        }
        for (var j$1 = len2 - 1 | 0; j$1 >= 0; --j$1) {
          a2[j$1 + i2 | 0] = a1[j$1 + i1 | 0];
        }
      }
      function dup(prim) {
        return prim.slice(0);
      }
      exports.dup = dup;
      exports.sub = sub;
      exports.concat = concat;
      exports.make = make;
      exports.make_float = make_float;
      exports.blit = blit;
      exports.get = get;
      exports.set = set;
    }
  });

  // node_modules/rescript/lib/js/curry.js
  var require_curry = __commonJS({
    "node_modules/rescript/lib/js/curry.js"(exports) {
      "use strict";
      var Caml_array = require_caml_array();
      function app(_f, _args) {
        while (true) {
          var args = _args;
          var f = _f;
          var init_arity = f.length;
          var arity = init_arity === 0 ? 1 : init_arity;
          var len = args.length;
          var d = arity - len | 0;
          if (d === 0) {
            return f.apply(null, args);
          }
          if (d >= 0) {
            return function(f2, args2) {
              return function(x) {
                return app(f2, args2.concat([x]));
              };
            }(f, args);
          }
          _args = Caml_array.sub(args, arity, -d | 0);
          _f = f.apply(null, Caml_array.sub(args, 0, arity));
          continue;
        }
        ;
      }
      function _1(o, a0) {
        var arity = o.length;
        if (arity === 1) {
          return o(a0);
        } else {
          switch (arity) {
            case 1:
              return o(a0);
            case 2:
              return function(param) {
                return o(a0, param);
              };
            case 3:
              return function(param, param$1) {
                return o(a0, param, param$1);
              };
            case 4:
              return function(param, param$1, param$2) {
                return o(a0, param, param$1, param$2);
              };
            case 5:
              return function(param, param$1, param$2, param$3) {
                return o(a0, param, param$1, param$2, param$3);
              };
            case 6:
              return function(param, param$1, param$2, param$3, param$4) {
                return o(a0, param, param$1, param$2, param$3, param$4);
              };
            case 7:
              return function(param, param$1, param$2, param$3, param$4, param$5) {
                return o(a0, param, param$1, param$2, param$3, param$4, param$5);
              };
            default:
              return app(o, [a0]);
          }
        }
      }
      function __1(o) {
        var arity = o.length;
        if (arity === 1) {
          return o;
        } else {
          return function(a0) {
            return _1(o, a0);
          };
        }
      }
      function _2(o, a0, a1) {
        var arity = o.length;
        if (arity === 2) {
          return o(a0, a1);
        } else {
          switch (arity) {
            case 1:
              return app(o(a0), [a1]);
            case 2:
              return o(a0, a1);
            case 3:
              return function(param) {
                return o(a0, a1, param);
              };
            case 4:
              return function(param, param$1) {
                return o(a0, a1, param, param$1);
              };
            case 5:
              return function(param, param$1, param$2) {
                return o(a0, a1, param, param$1, param$2);
              };
            case 6:
              return function(param, param$1, param$2, param$3) {
                return o(a0, a1, param, param$1, param$2, param$3);
              };
            case 7:
              return function(param, param$1, param$2, param$3, param$4) {
                return o(a0, a1, param, param$1, param$2, param$3, param$4);
              };
            default:
              return app(o, [
                a0,
                a1
              ]);
          }
        }
      }
      function __2(o) {
        var arity = o.length;
        if (arity === 2) {
          return o;
        } else {
          return function(a0, a1) {
            return _2(o, a0, a1);
          };
        }
      }
      function _3(o, a0, a1, a2) {
        var arity = o.length;
        if (arity === 3) {
          return o(a0, a1, a2);
        } else {
          switch (arity) {
            case 1:
              return app(o(a0), [
                a1,
                a2
              ]);
            case 2:
              return app(o(a0, a1), [a2]);
            case 3:
              return o(a0, a1, a2);
            case 4:
              return function(param) {
                return o(a0, a1, a2, param);
              };
            case 5:
              return function(param, param$1) {
                return o(a0, a1, a2, param, param$1);
              };
            case 6:
              return function(param, param$1, param$2) {
                return o(a0, a1, a2, param, param$1, param$2);
              };
            case 7:
              return function(param, param$1, param$2, param$3) {
                return o(a0, a1, a2, param, param$1, param$2, param$3);
              };
            default:
              return app(o, [
                a0,
                a1,
                a2
              ]);
          }
        }
      }
      function __3(o) {
        var arity = o.length;
        if (arity === 3) {
          return o;
        } else {
          return function(a0, a1, a2) {
            return _3(o, a0, a1, a2);
          };
        }
      }
      function _4(o, a0, a1, a2, a3) {
        var arity = o.length;
        if (arity === 4) {
          return o(a0, a1, a2, a3);
        } else {
          switch (arity) {
            case 1:
              return app(o(a0), [
                a1,
                a2,
                a3
              ]);
            case 2:
              return app(o(a0, a1), [
                a2,
                a3
              ]);
            case 3:
              return app(o(a0, a1, a2), [a3]);
            case 4:
              return o(a0, a1, a2, a3);
            case 5:
              return function(param) {
                return o(a0, a1, a2, a3, param);
              };
            case 6:
              return function(param, param$1) {
                return o(a0, a1, a2, a3, param, param$1);
              };
            case 7:
              return function(param, param$1, param$2) {
                return o(a0, a1, a2, a3, param, param$1, param$2);
              };
            default:
              return app(o, [
                a0,
                a1,
                a2,
                a3
              ]);
          }
        }
      }
      function __4(o) {
        var arity = o.length;
        if (arity === 4) {
          return o;
        } else {
          return function(a0, a1, a2, a3) {
            return _4(o, a0, a1, a2, a3);
          };
        }
      }
      function _5(o, a0, a1, a2, a3, a4) {
        var arity = o.length;
        if (arity === 5) {
          return o(a0, a1, a2, a3, a4);
        } else {
          switch (arity) {
            case 1:
              return app(o(a0), [
                a1,
                a2,
                a3,
                a4
              ]);
            case 2:
              return app(o(a0, a1), [
                a2,
                a3,
                a4
              ]);
            case 3:
              return app(o(a0, a1, a2), [
                a3,
                a4
              ]);
            case 4:
              return app(o(a0, a1, a2, a3), [a4]);
            case 5:
              return o(a0, a1, a2, a3, a4);
            case 6:
              return function(param) {
                return o(a0, a1, a2, a3, a4, param);
              };
            case 7:
              return function(param, param$1) {
                return o(a0, a1, a2, a3, a4, param, param$1);
              };
            default:
              return app(o, [
                a0,
                a1,
                a2,
                a3,
                a4
              ]);
          }
        }
      }
      function __5(o) {
        var arity = o.length;
        if (arity === 5) {
          return o;
        } else {
          return function(a0, a1, a2, a3, a4) {
            return _5(o, a0, a1, a2, a3, a4);
          };
        }
      }
      function _6(o, a0, a1, a2, a3, a4, a5) {
        var arity = o.length;
        if (arity === 6) {
          return o(a0, a1, a2, a3, a4, a5);
        } else {
          switch (arity) {
            case 1:
              return app(o(a0), [
                a1,
                a2,
                a3,
                a4,
                a5
              ]);
            case 2:
              return app(o(a0, a1), [
                a2,
                a3,
                a4,
                a5
              ]);
            case 3:
              return app(o(a0, a1, a2), [
                a3,
                a4,
                a5
              ]);
            case 4:
              return app(o(a0, a1, a2, a3), [
                a4,
                a5
              ]);
            case 5:
              return app(o(a0, a1, a2, a3, a4), [a5]);
            case 6:
              return o(a0, a1, a2, a3, a4, a5);
            case 7:
              return function(param) {
                return o(a0, a1, a2, a3, a4, a5, param);
              };
            default:
              return app(o, [
                a0,
                a1,
                a2,
                a3,
                a4,
                a5
              ]);
          }
        }
      }
      function __6(o) {
        var arity = o.length;
        if (arity === 6) {
          return o;
        } else {
          return function(a0, a1, a2, a3, a4, a5) {
            return _6(o, a0, a1, a2, a3, a4, a5);
          };
        }
      }
      function _7(o, a0, a1, a2, a3, a4, a5, a6) {
        var arity = o.length;
        if (arity === 7) {
          return o(a0, a1, a2, a3, a4, a5, a6);
        } else {
          switch (arity) {
            case 1:
              return app(o(a0), [
                a1,
                a2,
                a3,
                a4,
                a5,
                a6
              ]);
            case 2:
              return app(o(a0, a1), [
                a2,
                a3,
                a4,
                a5,
                a6
              ]);
            case 3:
              return app(o(a0, a1, a2), [
                a3,
                a4,
                a5,
                a6
              ]);
            case 4:
              return app(o(a0, a1, a2, a3), [
                a4,
                a5,
                a6
              ]);
            case 5:
              return app(o(a0, a1, a2, a3, a4), [
                a5,
                a6
              ]);
            case 6:
              return app(o(a0, a1, a2, a3, a4, a5), [a6]);
            case 7:
              return o(a0, a1, a2, a3, a4, a5, a6);
            default:
              return app(o, [
                a0,
                a1,
                a2,
                a3,
                a4,
                a5,
                a6
              ]);
          }
        }
      }
      function __7(o) {
        var arity = o.length;
        if (arity === 7) {
          return o;
        } else {
          return function(a0, a1, a2, a3, a4, a5, a6) {
            return _7(o, a0, a1, a2, a3, a4, a5, a6);
          };
        }
      }
      function _8(o, a0, a1, a2, a3, a4, a5, a6, a7) {
        var arity = o.length;
        if (arity === 8) {
          return o(a0, a1, a2, a3, a4, a5, a6, a7);
        } else {
          switch (arity) {
            case 1:
              return app(o(a0), [
                a1,
                a2,
                a3,
                a4,
                a5,
                a6,
                a7
              ]);
            case 2:
              return app(o(a0, a1), [
                a2,
                a3,
                a4,
                a5,
                a6,
                a7
              ]);
            case 3:
              return app(o(a0, a1, a2), [
                a3,
                a4,
                a5,
                a6,
                a7
              ]);
            case 4:
              return app(o(a0, a1, a2, a3), [
                a4,
                a5,
                a6,
                a7
              ]);
            case 5:
              return app(o(a0, a1, a2, a3, a4), [
                a5,
                a6,
                a7
              ]);
            case 6:
              return app(o(a0, a1, a2, a3, a4, a5), [
                a6,
                a7
              ]);
            case 7:
              return app(o(a0, a1, a2, a3, a4, a5, a6), [a7]);
            default:
              return app(o, [
                a0,
                a1,
                a2,
                a3,
                a4,
                a5,
                a6,
                a7
              ]);
          }
        }
      }
      function __8(o) {
        var arity = o.length;
        if (arity === 8) {
          return o;
        } else {
          return function(a0, a1, a2, a3, a4, a5, a6, a7) {
            return _8(o, a0, a1, a2, a3, a4, a5, a6, a7);
          };
        }
      }
      exports.app = app;
      exports._1 = _1;
      exports.__1 = __1;
      exports._2 = _2;
      exports.__2 = __2;
      exports._3 = _3;
      exports.__3 = __3;
      exports._4 = _4;
      exports.__4 = __4;
      exports._5 = _5;
      exports.__5 = __5;
      exports._6 = _6;
      exports.__6 = __6;
      exports._7 = _7;
      exports.__7 = __7;
      exports._8 = _8;
      exports.__8 = __8;
    }
  });

  // node_modules/qunit/qunit/qunit.js
  var require_qunit = __commonJS({
    "node_modules/qunit/qunit/qunit.js"(exports, module) {
      (function() {
        "use strict";
        var Map = typeof Map === "function" ? Map : function StringMap() {
          var store = Object.create(null);
          this.get = function(strKey) {
            return store[strKey];
          };
          this.set = function(strKey, val) {
            store[strKey] = val;
            return this;
          };
          this.clear = function() {
            store = Object.create(null);
          };
        };
        function _typeof(obj) {
          "@babel/helpers - typeof";
          if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
            _typeof = function(obj2) {
              return typeof obj2;
            };
          } else {
            _typeof = function(obj2) {
              return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
            };
          }
          return _typeof(obj);
        }
        function _classCallCheck(instance, Constructor) {
          if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
          }
        }
        function _defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor)
              descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }
        function _createClass(Constructor, protoProps, staticProps) {
          if (protoProps)
            _defineProperties(Constructor.prototype, protoProps);
          if (staticProps)
            _defineProperties(Constructor, staticProps);
          return Constructor;
        }
        function _toConsumableArray(arr) {
          return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
        }
        function _arrayWithoutHoles(arr) {
          if (Array.isArray(arr))
            return _arrayLikeToArray(arr);
        }
        function _iterableToArray(iter) {
          if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null)
            return Array.from(iter);
        }
        function _unsupportedIterableToArray(o, minLen) {
          if (!o)
            return;
          if (typeof o === "string")
            return _arrayLikeToArray(o, minLen);
          var n = Object.prototype.toString.call(o).slice(8, -1);
          if (n === "Object" && o.constructor)
            n = o.constructor.name;
          if (n === "Map" || n === "Set")
            return Array.from(o);
          if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
            return _arrayLikeToArray(o, minLen);
        }
        function _arrayLikeToArray(arr, len) {
          if (len == null || len > arr.length)
            len = arr.length;
          for (var i = 0, arr2 = new Array(len); i < len; i++)
            arr2[i] = arr[i];
          return arr2;
        }
        function _nonIterableSpread() {
          throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
        }
        function _createForOfIteratorHelper(o, allowArrayLike) {
          var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"];
          if (!it) {
            if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
              if (it)
                o = it;
              var i = 0;
              var F = function() {
              };
              return {
                s: F,
                n: function() {
                  if (i >= o.length)
                    return {
                      done: true
                    };
                  return {
                    done: false,
                    value: o[i++]
                  };
                },
                e: function(e) {
                  throw e;
                },
                f: F
              };
            }
            throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
          }
          var normalCompletion = true, didErr = false, err;
          return {
            s: function() {
              it = it.call(o);
            },
            n: function() {
              var step = it.next();
              normalCompletion = step.done;
              return step;
            },
            e: function(e) {
              didErr = true;
              err = e;
            },
            f: function() {
              try {
                if (!normalCompletion && it.return != null)
                  it.return();
              } finally {
                if (didErr)
                  throw err;
              }
            }
          };
        }
        var foundGlobalThis;
        (function(Object2) {
          if ((typeof globalThis === "undefined" ? "undefined" : _typeof(globalThis)) === "object") {
            foundGlobalThis = globalThis;
          } else {
            var get = function get2() {
              foundGlobalThis = this || self;
              delete Object2.prototype._T_;
            };
            this ? get() : (Object2.defineProperty(Object2.prototype, "_T_", {
              configurable: true,
              get
            }), _T_);
          }
        })(Object);
        var globalThis$1 = foundGlobalThis;
        var window$1 = globalThis$1.window;
        var self$1 = globalThis$1.self;
        var console$1 = globalThis$1.console;
        var setTimeout$1 = globalThis$1.setTimeout;
        var clearTimeout = globalThis$1.clearTimeout;
        var document = window$1 && window$1.document;
        var navigator = window$1 && window$1.navigator;
        var localSessionStorage = function() {
          var x = "qunit-test-string";
          try {
            globalThis$1.sessionStorage.setItem(x, x);
            globalThis$1.sessionStorage.removeItem(x);
            return globalThis$1.sessionStorage;
          } catch (e) {
            return void 0;
          }
        }();
        var Logger = {
          warn: console$1 ? Function.prototype.bind.call(console$1.warn || console$1.log, console$1) : function() {
          }
        };
        var toString = Object.prototype.toString;
        var hasOwn$1 = Object.prototype.hasOwnProperty;
        var now = Date.now || function() {
          return new Date().getTime();
        };
        var nativePerf = getNativePerf();
        function getNativePerf() {
          if (window$1 && typeof window$1.performance !== "undefined" && typeof window$1.performance.mark === "function" && typeof window$1.performance.measure === "function") {
            return window$1.performance;
          } else {
            return void 0;
          }
        }
        var performance = {
          now: nativePerf ? nativePerf.now.bind(nativePerf) : now,
          measure: nativePerf ? function(comment, startMark, endMark) {
            try {
              nativePerf.measure(comment, startMark, endMark);
            } catch (ex) {
              Logger.warn("performance.measure could not be executed because of ", ex.message);
            }
          } : function() {
          },
          mark: nativePerf ? nativePerf.mark.bind(nativePerf) : function() {
          }
        };
        function diff(a, b) {
          var result = a.slice();
          for (var i = 0; i < result.length; i++) {
            for (var j = 0; j < b.length; j++) {
              if (result[i] === b[j]) {
                result.splice(i, 1);
                i--;
                break;
              }
            }
          }
          return result;
        }
        function inArray(elem, array) {
          return array.indexOf(elem) !== -1;
        }
        function objectValues(obj) {
          var vals = is("array", obj) ? [] : {};
          for (var key in obj) {
            if (hasOwn$1.call(obj, key)) {
              var val = obj[key];
              vals[key] = val === Object(val) ? objectValues(val) : val;
            }
          }
          return vals;
        }
        function extend(a, b, undefOnly) {
          for (var prop in b) {
            if (hasOwn$1.call(b, prop)) {
              if (b[prop] === void 0) {
                delete a[prop];
              } else if (!(undefOnly && typeof a[prop] !== "undefined")) {
                a[prop] = b[prop];
              }
            }
          }
          return a;
        }
        function objectType(obj) {
          if (typeof obj === "undefined") {
            return "undefined";
          }
          if (obj === null) {
            return "null";
          }
          var match = toString.call(obj).match(/^\[object\s(.*)\]$/);
          var type = match && match[1];
          switch (type) {
            case "Number":
              if (isNaN(obj)) {
                return "nan";
              }
              return "number";
            case "String":
            case "Boolean":
            case "Array":
            case "Set":
            case "Map":
            case "Date":
            case "RegExp":
            case "Function":
            case "Symbol":
              return type.toLowerCase();
            default:
              return _typeof(obj);
          }
        }
        function is(type, obj) {
          return objectType(obj) === type;
        }
        function generateHash(module2, testName) {
          var str = module2 + "" + testName;
          var hash = 0;
          for (var i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
          }
          var hex = (4294967296 + hash).toString(16);
          if (hex.length < 8) {
            hex = "0000000" + hex;
          }
          return hex.slice(-8);
        }
        var equiv = function() {
          var pairs = [];
          var getProto = Object.getPrototypeOf || function(obj) {
            return obj.__proto__;
          };
          function useStrictEquality(a, b) {
            if (_typeof(a) === "object") {
              a = a.valueOf();
            }
            if (_typeof(b) === "object") {
              b = b.valueOf();
            }
            return a === b;
          }
          function compareConstructors(a, b) {
            var protoA = getProto(a);
            var protoB = getProto(b);
            if (a.constructor === b.constructor) {
              return true;
            }
            if (protoA && protoA.constructor === null) {
              protoA = null;
            }
            if (protoB && protoB.constructor === null) {
              protoB = null;
            }
            if (protoA === null && protoB === Object.prototype || protoB === null && protoA === Object.prototype) {
              return true;
            }
            return false;
          }
          function getRegExpFlags(regexp) {
            return "flags" in regexp ? regexp.flags : regexp.toString().match(/[gimuy]*$/)[0];
          }
          function isContainer(val) {
            return ["object", "array", "map", "set"].indexOf(objectType(val)) !== -1;
          }
          function breadthFirstCompareChild(a, b) {
            if (a === b) {
              return true;
            }
            if (!isContainer(a)) {
              return typeEquiv(a, b);
            }
            if (pairs.every(function(pair) {
              return pair.a !== a || pair.b !== b;
            })) {
              pairs.push({
                a,
                b
              });
            }
            return true;
          }
          var callbacks = {
            "string": useStrictEquality,
            "boolean": useStrictEquality,
            "number": useStrictEquality,
            "null": useStrictEquality,
            "undefined": useStrictEquality,
            "symbol": useStrictEquality,
            "date": useStrictEquality,
            "nan": function nan() {
              return true;
            },
            "regexp": function regexp(a, b) {
              return a.source === b.source && getRegExpFlags(a) === getRegExpFlags(b);
            },
            "function": function _function() {
              return false;
            },
            "array": function array(a, b) {
              var len = a.length;
              if (len !== b.length) {
                return false;
              }
              for (var i = 0; i < len; i++) {
                if (!breadthFirstCompareChild(a[i], b[i])) {
                  return false;
                }
              }
              return true;
            },
            "set": function set(a, b) {
              if (a.size !== b.size) {
                return false;
              }
              var outerEq = true;
              a.forEach(function(aVal) {
                if (!outerEq) {
                  return;
                }
                var innerEq = false;
                b.forEach(function(bVal) {
                  if (innerEq) {
                    return;
                  }
                  var parentPairs = pairs;
                  if (innerEquiv(bVal, aVal)) {
                    innerEq = true;
                  }
                  pairs = parentPairs;
                });
                if (!innerEq) {
                  outerEq = false;
                }
              });
              return outerEq;
            },
            "map": function map(a, b) {
              if (a.size !== b.size) {
                return false;
              }
              var outerEq = true;
              a.forEach(function(aVal, aKey) {
                if (!outerEq) {
                  return;
                }
                var innerEq = false;
                b.forEach(function(bVal, bKey) {
                  if (innerEq) {
                    return;
                  }
                  var parentPairs = pairs;
                  if (innerEquiv([bVal, bKey], [aVal, aKey])) {
                    innerEq = true;
                  }
                  pairs = parentPairs;
                });
                if (!innerEq) {
                  outerEq = false;
                }
              });
              return outerEq;
            },
            "object": function object(a, b) {
              if (compareConstructors(a, b) === false) {
                return false;
              }
              var aProperties = [];
              var bProperties = [];
              for (var i in a) {
                aProperties.push(i);
                if (a.constructor !== Object && typeof a.constructor !== "undefined" && typeof a[i] === "function" && typeof b[i] === "function" && a[i].toString() === b[i].toString()) {
                  continue;
                }
                if (!breadthFirstCompareChild(a[i], b[i])) {
                  return false;
                }
              }
              for (var _i in b) {
                bProperties.push(_i);
              }
              return typeEquiv(aProperties.sort(), bProperties.sort());
            }
          };
          function typeEquiv(a, b) {
            var type = objectType(a);
            return objectType(b) === type && callbacks[type](a, b);
          }
          function innerEquiv(a, b) {
            if (arguments.length < 2) {
              return true;
            }
            pairs = [{
              a,
              b
            }];
            for (var i = 0; i < pairs.length; i++) {
              var pair = pairs[i];
              if (pair.a !== pair.b && !typeEquiv(pair.a, pair.b)) {
                return false;
              }
            }
            return arguments.length === 2 || innerEquiv.apply(this, [].slice.call(arguments, 1));
          }
          return function() {
            var result = innerEquiv.apply(void 0, arguments);
            pairs.length = 0;
            return result;
          };
        }();
        var config = {
          queue: [],
          blocking: true,
          failOnZeroTests: true,
          reorder: true,
          altertitle: true,
          collapse: true,
          scrolltop: true,
          maxDepth: 5,
          requireExpects: false,
          urlConfig: [],
          modules: [],
          currentModule: {
            name: "",
            tests: [],
            childModules: [],
            testsRun: 0,
            testsIgnored: 0,
            hooks: {
              before: [],
              beforeEach: [],
              afterEach: [],
              after: []
            }
          },
          callbacks: {},
          storage: localSessionStorage
        };
        var globalConfig = window$1 && window$1.QUnit && window$1.QUnit.config;
        if (window$1 && window$1.QUnit && !window$1.QUnit.version) {
          extend(config, globalConfig);
        }
        config.modules.push(config.currentModule);
        var dump = function() {
          function quote(str) {
            return '"' + str.toString().replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
          }
          function literal(o) {
            return o + "";
          }
          function join(pre, arr, post) {
            var s = dump2.separator();
            var inner = dump2.indent(1);
            if (arr.join) {
              arr = arr.join("," + s + inner);
            }
            if (!arr) {
              return pre + post;
            }
            var base = dump2.indent();
            return [pre, inner + arr, base + post].join(s);
          }
          function array(arr, stack) {
            if (dump2.maxDepth && dump2.depth > dump2.maxDepth) {
              return "[object Array]";
            }
            this.up();
            var i = arr.length;
            var ret = new Array(i);
            while (i--) {
              ret[i] = this.parse(arr[i], void 0, stack);
            }
            this.down();
            return join("[", ret, "]");
          }
          function isArray(obj) {
            return toString.call(obj) === "[object Array]" || typeof obj.length === "number" && obj.item !== void 0 && (obj.length ? obj.item(0) === obj[0] : obj.item(0) === null && obj[0] === void 0);
          }
          var reName = /^function (\w+)/;
          var dump2 = {
            parse: function parse(obj, objType, stack) {
              stack = stack || [];
              var objIndex = stack.indexOf(obj);
              if (objIndex !== -1) {
                return "recursion(".concat(objIndex - stack.length, ")");
              }
              objType = objType || this.typeOf(obj);
              var parser = this.parsers[objType];
              var parserType = _typeof(parser);
              if (parserType === "function") {
                stack.push(obj);
                var res = parser.call(this, obj, stack);
                stack.pop();
                return res;
              }
              if (parserType === "string") {
                return parser;
              }
              return "[ERROR: Missing QUnit.dump formatter for type " + objType + "]";
            },
            typeOf: function typeOf(obj) {
              var type;
              if (obj === null) {
                type = "null";
              } else if (typeof obj === "undefined") {
                type = "undefined";
              } else if (is("regexp", obj)) {
                type = "regexp";
              } else if (is("date", obj)) {
                type = "date";
              } else if (is("function", obj)) {
                type = "function";
              } else if (obj.setInterval !== void 0 && obj.document !== void 0 && obj.nodeType === void 0) {
                type = "window";
              } else if (obj.nodeType === 9) {
                type = "document";
              } else if (obj.nodeType) {
                type = "node";
              } else if (isArray(obj)) {
                type = "array";
              } else if (obj.constructor === Error.prototype.constructor) {
                type = "error";
              } else {
                type = _typeof(obj);
              }
              return type;
            },
            separator: function separator() {
              if (this.multiline) {
                return this.HTML ? "<br />" : "\n";
              } else {
                return this.HTML ? "&#160;" : " ";
              }
            },
            indent: function indent(extra) {
              if (!this.multiline) {
                return "";
              }
              var chr = this.indentChar;
              if (this.HTML) {
                chr = chr.replace(/\t/g, "   ").replace(/ /g, "&#160;");
              }
              return new Array(this.depth + (extra || 0)).join(chr);
            },
            up: function up(a) {
              this.depth += a || 1;
            },
            down: function down(a) {
              this.depth -= a || 1;
            },
            setParser: function setParser(name, parser) {
              this.parsers[name] = parser;
            },
            quote,
            literal,
            join,
            depth: 1,
            maxDepth: config.maxDepth,
            parsers: {
              window: "[Window]",
              document: "[Document]",
              error: function error(_error) {
                return 'Error("' + _error.message + '")';
              },
              unknown: "[Unknown]",
              "null": "null",
              "undefined": "undefined",
              "function": function _function(fn) {
                var ret = "function";
                var name = "name" in fn ? fn.name : (reName.exec(fn) || [])[1];
                if (name) {
                  ret += " " + name;
                }
                ret += "(";
                ret = [ret, dump2.parse(fn, "functionArgs"), "){"].join("");
                return join(ret, dump2.parse(fn, "functionCode"), "}");
              },
              array,
              nodelist: array,
              "arguments": array,
              object: function object(map, stack) {
                var ret = [];
                if (dump2.maxDepth && dump2.depth > dump2.maxDepth) {
                  return "[object Object]";
                }
                dump2.up();
                var keys = [];
                for (var key in map) {
                  keys.push(key);
                }
                var nonEnumerableProperties = ["message", "name"];
                for (var i in nonEnumerableProperties) {
                  var _key = nonEnumerableProperties[i];
                  if (_key in map && !inArray(_key, keys)) {
                    keys.push(_key);
                  }
                }
                keys.sort();
                for (var _i = 0; _i < keys.length; _i++) {
                  var _key2 = keys[_i];
                  var val = map[_key2];
                  ret.push(dump2.parse(_key2, "key") + ": " + dump2.parse(val, void 0, stack));
                }
                dump2.down();
                return join("{", ret, "}");
              },
              node: function node(_node) {
                var open = dump2.HTML ? "&lt;" : "<";
                var close = dump2.HTML ? "&gt;" : ">";
                var tag = _node.nodeName.toLowerCase();
                var ret = open + tag;
                var attrs = _node.attributes;
                if (attrs) {
                  for (var i = 0, len = attrs.length; i < len; i++) {
                    var val = attrs[i].nodeValue;
                    if (val && val !== "inherit") {
                      ret += " " + attrs[i].nodeName + "=" + dump2.parse(val, "attribute");
                    }
                  }
                }
                ret += close;
                if (_node.nodeType === 3 || _node.nodeType === 4) {
                  ret += _node.nodeValue;
                }
                return ret + open + "/" + tag + close;
              },
              functionArgs: function functionArgs(fn) {
                var l = fn.length;
                if (!l) {
                  return "";
                }
                var args = new Array(l);
                while (l--) {
                  args[l] = String.fromCharCode(97 + l);
                }
                return " " + args.join(", ") + " ";
              },
              key: quote,
              functionCode: "[code]",
              attribute: quote,
              string: quote,
              date: quote,
              regexp: literal,
              number: literal,
              "boolean": literal,
              symbol: function symbol(sym) {
                return sym.toString();
              }
            },
            HTML: false,
            indentChar: "  ",
            multiline: true
          };
          return dump2;
        }();
        var SuiteReport = /* @__PURE__ */ function() {
          function SuiteReport2(name, parentSuite) {
            _classCallCheck(this, SuiteReport2);
            this.name = name;
            this.fullName = parentSuite ? parentSuite.fullName.concat(name) : [];
            this.tests = [];
            this.childSuites = [];
            if (parentSuite) {
              parentSuite.pushChildSuite(this);
            }
          }
          _createClass(SuiteReport2, [{
            key: "start",
            value: function start(recordTime) {
              if (recordTime) {
                this._startTime = performance.now();
                var suiteLevel = this.fullName.length;
                performance.mark("qunit_suite_".concat(suiteLevel, "_start"));
              }
              return {
                name: this.name,
                fullName: this.fullName.slice(),
                tests: this.tests.map(function(test2) {
                  return test2.start();
                }),
                childSuites: this.childSuites.map(function(suite) {
                  return suite.start();
                }),
                testCounts: {
                  total: this.getTestCounts().total
                }
              };
            }
          }, {
            key: "end",
            value: function end(recordTime) {
              if (recordTime) {
                this._endTime = performance.now();
                var suiteLevel = this.fullName.length;
                var suiteName = this.fullName.join(" \u2013 ");
                performance.mark("qunit_suite_".concat(suiteLevel, "_end"));
                performance.measure(suiteLevel === 0 ? "QUnit Test Run" : "QUnit Test Suite: ".concat(suiteName), "qunit_suite_".concat(suiteLevel, "_start"), "qunit_suite_".concat(suiteLevel, "_end"));
              }
              return {
                name: this.name,
                fullName: this.fullName.slice(),
                tests: this.tests.map(function(test2) {
                  return test2.end();
                }),
                childSuites: this.childSuites.map(function(suite) {
                  return suite.end();
                }),
                testCounts: this.getTestCounts(),
                runtime: this.getRuntime(),
                status: this.getStatus()
              };
            }
          }, {
            key: "pushChildSuite",
            value: function pushChildSuite(suite) {
              this.childSuites.push(suite);
            }
          }, {
            key: "pushTest",
            value: function pushTest(test2) {
              this.tests.push(test2);
            }
          }, {
            key: "getRuntime",
            value: function getRuntime() {
              return this._endTime - this._startTime;
            }
          }, {
            key: "getTestCounts",
            value: function getTestCounts() {
              var counts = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {
                passed: 0,
                failed: 0,
                skipped: 0,
                todo: 0,
                total: 0
              };
              counts = this.tests.reduce(function(counts2, test2) {
                if (test2.valid) {
                  counts2[test2.getStatus()]++;
                  counts2.total++;
                }
                return counts2;
              }, counts);
              return this.childSuites.reduce(function(counts2, suite) {
                return suite.getTestCounts(counts2);
              }, counts);
            }
          }, {
            key: "getStatus",
            value: function getStatus() {
              var _this$getTestCounts = this.getTestCounts(), total = _this$getTestCounts.total, failed = _this$getTestCounts.failed, skipped = _this$getTestCounts.skipped, todo = _this$getTestCounts.todo;
              if (failed) {
                return "failed";
              } else {
                if (skipped === total) {
                  return "skipped";
                } else if (todo === total) {
                  return "todo";
                } else {
                  return "passed";
                }
              }
            }
          }]);
          return SuiteReport2;
        }();
        var moduleStack = [];
        function isParentModuleInQueue() {
          var modulesInQueue = config.modules.filter(function(module2) {
            return !module2.ignored;
          }).map(function(module2) {
            return module2.moduleId;
          });
          return moduleStack.some(function(module2) {
            return modulesInQueue.includes(module2.moduleId);
          });
        }
        function createModule(name, testEnvironment, modifiers) {
          var parentModule = moduleStack.length ? moduleStack.slice(-1)[0] : null;
          var moduleName = parentModule !== null ? [parentModule.name, name].join(" > ") : name;
          var parentSuite = parentModule ? parentModule.suiteReport : globalSuite;
          var skip = parentModule !== null && parentModule.skip || modifiers.skip;
          var todo = parentModule !== null && parentModule.todo || modifiers.todo;
          var module2 = {
            name: moduleName,
            parentModule,
            tests: [],
            moduleId: generateHash(moduleName),
            testsRun: 0,
            testsIgnored: 0,
            childModules: [],
            suiteReport: new SuiteReport(name, parentSuite),
            skip,
            todo: skip ? false : todo,
            ignored: modifiers.ignored || false
          };
          var env = {};
          if (parentModule) {
            parentModule.childModules.push(module2);
            extend(env, parentModule.testEnvironment);
          }
          extend(env, testEnvironment);
          module2.testEnvironment = env;
          config.modules.push(module2);
          return module2;
        }
        function processModule(name, options, executeNow) {
          var modifiers = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
          if (objectType(options) === "function") {
            executeNow = options;
            options = void 0;
          }
          var module2 = createModule(name, options, modifiers);
          var testEnvironment = module2.testEnvironment;
          var hooks = module2.hooks = {};
          setHookFromEnvironment(hooks, testEnvironment, "before");
          setHookFromEnvironment(hooks, testEnvironment, "beforeEach");
          setHookFromEnvironment(hooks, testEnvironment, "afterEach");
          setHookFromEnvironment(hooks, testEnvironment, "after");
          var moduleFns = {
            before: setHookFunction(module2, "before"),
            beforeEach: setHookFunction(module2, "beforeEach"),
            afterEach: setHookFunction(module2, "afterEach"),
            after: setHookFunction(module2, "after")
          };
          var currentModule = config.currentModule;
          if (objectType(executeNow) === "function") {
            moduleStack.push(module2);
            config.currentModule = module2;
            var cbReturnValue = executeNow.call(module2.testEnvironment, moduleFns);
            if (cbReturnValue != null && objectType(cbReturnValue.then) === "function") {
              Logger.warn("Returning a promise from a module callback is not supported. Instead, use hooks for async behavior. This will become an error in QUnit 3.0.");
            }
            moduleStack.pop();
            module2 = module2.parentModule || currentModule;
          }
          config.currentModule = module2;
          function setHookFromEnvironment(hooks2, environment, name2) {
            var potentialHook = environment[name2];
            hooks2[name2] = typeof potentialHook === "function" ? [potentialHook] : [];
            delete environment[name2];
          }
          function setHookFunction(module3, hookName) {
            return function setHook(callback) {
              if (config.currentModule !== module3) {
                Logger.warn("The `" + hookName + "` hook was called inside the wrong module. Instead, use hooks provided by the callback to the containing module. This will become an error in QUnit 3.0.");
              }
              module3.hooks[hookName].push(callback);
            };
          }
        }
        var focused$1 = false;
        function module$1(name, options, executeNow) {
          var ignored = focused$1 && !isParentModuleInQueue();
          processModule(name, options, executeNow, {
            ignored
          });
        }
        module$1.only = function() {
          if (!focused$1) {
            config.modules.length = 0;
            config.queue.length = 0;
          }
          processModule.apply(void 0, arguments);
          focused$1 = true;
        };
        module$1.skip = function(name, options, executeNow) {
          if (focused$1) {
            return;
          }
          processModule(name, options, executeNow, {
            skip: true
          });
        };
        module$1.todo = function(name, options, executeNow) {
          if (focused$1) {
            return;
          }
          processModule(name, options, executeNow, {
            todo: true
          });
        };
        var LISTENERS = Object.create(null);
        var SUPPORTED_EVENTS = ["runStart", "suiteStart", "testStart", "assertion", "testEnd", "suiteEnd", "runEnd"];
        function emit(eventName, data) {
          if (objectType(eventName) !== "string") {
            throw new TypeError("eventName must be a string when emitting an event");
          }
          var originalCallbacks = LISTENERS[eventName];
          var callbacks = originalCallbacks ? _toConsumableArray(originalCallbacks) : [];
          for (var i = 0; i < callbacks.length; i++) {
            callbacks[i](data);
          }
        }
        function on(eventName, callback) {
          if (objectType(eventName) !== "string") {
            throw new TypeError("eventName must be a string when registering a listener");
          } else if (!inArray(eventName, SUPPORTED_EVENTS)) {
            var events = SUPPORTED_EVENTS.join(", ");
            throw new Error('"'.concat(eventName, '" is not a valid event; must be one of: ').concat(events, "."));
          } else if (objectType(callback) !== "function") {
            throw new TypeError("callback must be a function when registering a listener");
          }
          if (!LISTENERS[eventName]) {
            LISTENERS[eventName] = [];
          }
          if (!inArray(callback, LISTENERS[eventName])) {
            LISTENERS[eventName].push(callback);
          }
        }
        var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
        function commonjsRequire(path) {
          throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
        }
        var promisePolyfill = { exports: {} };
        (function() {
          var globalNS = function() {
            if (typeof globalThis !== "undefined") {
              return globalThis;
            }
            if (typeof self !== "undefined") {
              return self;
            }
            if (typeof window !== "undefined") {
              return window;
            }
            if (typeof commonjsGlobal !== "undefined") {
              return commonjsGlobal;
            }
            throw new Error("unable to locate global object");
          }();
          if (typeof globalNS["Promise"] === "function") {
            promisePolyfill.exports = globalNS["Promise"];
            return;
          }
          function finallyConstructor(callback) {
            var constructor = this.constructor;
            return this.then(function(value) {
              return constructor.resolve(callback()).then(function() {
                return value;
              });
            }, function(reason) {
              return constructor.resolve(callback()).then(function() {
                return constructor.reject(reason);
              });
            });
          }
          function allSettled(arr) {
            var P = this;
            return new P(function(resolve2, reject2) {
              if (!(arr && typeof arr.length !== "undefined")) {
                return reject2(new TypeError(_typeof(arr) + " " + arr + " is not iterable(cannot read property Symbol(Symbol.iterator))"));
              }
              var args = Array.prototype.slice.call(arr);
              if (args.length === 0)
                return resolve2([]);
              var remaining = args.length;
              function res(i2, val) {
                if (val && (_typeof(val) === "object" || typeof val === "function")) {
                  var then = val.then;
                  if (typeof then === "function") {
                    then.call(val, function(val2) {
                      res(i2, val2);
                    }, function(e) {
                      args[i2] = {
                        status: "rejected",
                        reason: e
                      };
                      if (--remaining === 0) {
                        resolve2(args);
                      }
                    });
                    return;
                  }
                }
                args[i2] = {
                  status: "fulfilled",
                  value: val
                };
                if (--remaining === 0) {
                  resolve2(args);
                }
              }
              for (var i = 0; i < args.length; i++) {
                res(i, args[i]);
              }
            });
          }
          var setTimeoutFunc = setTimeout;
          function isArray(x) {
            return Boolean(x && typeof x.length !== "undefined");
          }
          function noop() {
          }
          function bind(fn, thisArg) {
            return function() {
              fn.apply(thisArg, arguments);
            };
          }
          function Promise2(fn) {
            if (!(this instanceof Promise2))
              throw new TypeError("Promises must be constructed via new");
            if (typeof fn !== "function")
              throw new TypeError("not a function");
            this._state = 0;
            this._handled = false;
            this._value = void 0;
            this._deferreds = [];
            doResolve(fn, this);
          }
          function handle(self2, deferred) {
            while (self2._state === 3) {
              self2 = self2._value;
            }
            if (self2._state === 0) {
              self2._deferreds.push(deferred);
              return;
            }
            self2._handled = true;
            Promise2._immediateFn(function() {
              var cb = self2._state === 1 ? deferred.onFulfilled : deferred.onRejected;
              if (cb === null) {
                (self2._state === 1 ? resolve : reject)(deferred.promise, self2._value);
                return;
              }
              var ret;
              try {
                ret = cb(self2._value);
              } catch (e) {
                reject(deferred.promise, e);
                return;
              }
              resolve(deferred.promise, ret);
            });
          }
          function resolve(self2, newValue) {
            try {
              if (newValue === self2)
                throw new TypeError("A promise cannot be resolved with itself.");
              if (newValue && (_typeof(newValue) === "object" || typeof newValue === "function")) {
                var then = newValue.then;
                if (newValue instanceof Promise2) {
                  self2._state = 3;
                  self2._value = newValue;
                  finale(self2);
                  return;
                } else if (typeof then === "function") {
                  doResolve(bind(then, newValue), self2);
                  return;
                }
              }
              self2._state = 1;
              self2._value = newValue;
              finale(self2);
            } catch (e) {
              reject(self2, e);
            }
          }
          function reject(self2, newValue) {
            self2._state = 2;
            self2._value = newValue;
            finale(self2);
          }
          function finale(self2) {
            if (self2._state === 2 && self2._deferreds.length === 0) {
              Promise2._immediateFn(function() {
                if (!self2._handled) {
                  Promise2._unhandledRejectionFn(self2._value);
                }
              });
            }
            for (var i = 0, len = self2._deferreds.length; i < len; i++) {
              handle(self2, self2._deferreds[i]);
            }
            self2._deferreds = null;
          }
          function Handler(onFulfilled, onRejected, promise) {
            this.onFulfilled = typeof onFulfilled === "function" ? onFulfilled : null;
            this.onRejected = typeof onRejected === "function" ? onRejected : null;
            this.promise = promise;
          }
          function doResolve(fn, self2) {
            var done2 = false;
            try {
              fn(function(value) {
                if (done2)
                  return;
                done2 = true;
                resolve(self2, value);
              }, function(reason) {
                if (done2)
                  return;
                done2 = true;
                reject(self2, reason);
              });
            } catch (ex) {
              if (done2)
                return;
              done2 = true;
              reject(self2, ex);
            }
          }
          Promise2.prototype["catch"] = function(onRejected) {
            return this.then(null, onRejected);
          };
          Promise2.prototype.then = function(onFulfilled, onRejected) {
            var prom = new this.constructor(noop);
            handle(this, new Handler(onFulfilled, onRejected, prom));
            return prom;
          };
          Promise2.prototype["finally"] = finallyConstructor;
          Promise2.all = function(arr) {
            return new Promise2(function(resolve2, reject2) {
              if (!isArray(arr)) {
                return reject2(new TypeError("Promise.all accepts an array"));
              }
              var args = Array.prototype.slice.call(arr);
              if (args.length === 0)
                return resolve2([]);
              var remaining = args.length;
              function res(i2, val) {
                try {
                  if (val && (_typeof(val) === "object" || typeof val === "function")) {
                    var then = val.then;
                    if (typeof then === "function") {
                      then.call(val, function(val2) {
                        res(i2, val2);
                      }, reject2);
                      return;
                    }
                  }
                  args[i2] = val;
                  if (--remaining === 0) {
                    resolve2(args);
                  }
                } catch (ex) {
                  reject2(ex);
                }
              }
              for (var i = 0; i < args.length; i++) {
                res(i, args[i]);
              }
            });
          };
          Promise2.allSettled = allSettled;
          Promise2.resolve = function(value) {
            if (value && _typeof(value) === "object" && value.constructor === Promise2) {
              return value;
            }
            return new Promise2(function(resolve2) {
              resolve2(value);
            });
          };
          Promise2.reject = function(value) {
            return new Promise2(function(resolve2, reject2) {
              reject2(value);
            });
          };
          Promise2.race = function(arr) {
            return new Promise2(function(resolve2, reject2) {
              if (!isArray(arr)) {
                return reject2(new TypeError("Promise.race accepts an array"));
              }
              for (var i = 0, len = arr.length; i < len; i++) {
                Promise2.resolve(arr[i]).then(resolve2, reject2);
              }
            });
          };
          Promise2._immediateFn = typeof setImmediate === "function" && function(fn) {
            setImmediate(fn);
          } || function(fn) {
            setTimeoutFunc(fn, 0);
          };
          Promise2._unhandledRejectionFn = function _unhandledRejectionFn(err) {
            if (typeof console !== "undefined" && console) {
              console.warn("Possible Unhandled Promise Rejection:", err);
            }
          };
          promisePolyfill.exports = Promise2;
        })();
        var _Promise = promisePolyfill.exports;
        function registerLoggingCallbacks(obj) {
          var callbackNames = ["begin", "done", "log", "testStart", "testDone", "moduleStart", "moduleDone"];
          function registerLoggingCallback(key2) {
            var loggingCallback = function loggingCallback2(callback) {
              if (objectType(callback) !== "function") {
                throw new Error("QUnit logging methods require a callback function as their first parameters.");
              }
              config.callbacks[key2].push(callback);
            };
            return loggingCallback;
          }
          for (var i = 0, l = callbackNames.length; i < l; i++) {
            var key = callbackNames[i];
            if (objectType(config.callbacks[key]) === "undefined") {
              config.callbacks[key] = [];
            }
            obj[key] = registerLoggingCallback(key);
          }
        }
        function runLoggingCallbacks(key, args) {
          var callbacks = config.callbacks[key];
          if (key === "log") {
            callbacks.map(function(callback) {
              return callback(args);
            });
            return;
          }
          return callbacks.reduce(function(promiseChain, callback) {
            return promiseChain.then(function() {
              return _Promise.resolve(callback(args));
            });
          }, _Promise.resolve([]));
        }
        var fileName = (sourceFromStacktrace(0) || "").replace(/(:\d+)+\)?/, "").replace(/.+\//, "");
        function extractStacktrace(e, offset) {
          offset = offset === void 0 ? 4 : offset;
          if (e && e.stack) {
            var stack = e.stack.split("\n");
            if (/^error$/i.test(stack[0])) {
              stack.shift();
            }
            if (fileName) {
              var include = [];
              for (var i = offset; i < stack.length; i++) {
                if (stack[i].indexOf(fileName) !== -1) {
                  break;
                }
                include.push(stack[i]);
              }
              if (include.length) {
                return include.join("\n");
              }
            }
            return stack[offset];
          }
        }
        function sourceFromStacktrace(offset) {
          var error = new Error();
          if (!error.stack) {
            try {
              throw error;
            } catch (err) {
              error = err;
            }
          }
          return extractStacktrace(error, offset);
        }
        var priorityCount = 0;
        var unitSampler;
        var taskQueue = [];
        function advance() {
          advanceTaskQueue();
          if (!taskQueue.length && !config.blocking && !config.current) {
            advanceTestQueue();
          }
        }
        function advanceTaskQueue() {
          var start = now();
          config.depth = (config.depth || 0) + 1;
          processTaskQueue(start);
          config.depth--;
        }
        function processTaskQueue(start) {
          if (taskQueue.length && !config.blocking) {
            var elapsedTime = now() - start;
            if (!setTimeout$1 || config.updateRate <= 0 || elapsedTime < config.updateRate) {
              var task = taskQueue.shift();
              _Promise.resolve(task()).then(function() {
                if (!taskQueue.length) {
                  advance();
                } else {
                  processTaskQueue(start);
                }
              });
            } else {
              setTimeout$1(advance);
            }
          }
        }
        function advanceTestQueue() {
          if (!config.blocking && !config.queue.length && config.depth === 0) {
            done();
            return;
          }
          var testTasks = config.queue.shift();
          addToTaskQueue(testTasks());
          if (priorityCount > 0) {
            priorityCount--;
          }
          advance();
        }
        function addToTaskQueue(tasksArray) {
          taskQueue.push.apply(taskQueue, _toConsumableArray(tasksArray));
        }
        function taskQueueLength() {
          return taskQueue.length;
        }
        function addToTestQueue(testTasksFunc, prioritize, seed) {
          if (prioritize) {
            config.queue.splice(priorityCount++, 0, testTasksFunc);
          } else if (seed) {
            if (!unitSampler) {
              unitSampler = unitSamplerGenerator(seed);
            }
            var index = Math.floor(unitSampler() * (config.queue.length - priorityCount + 1));
            config.queue.splice(priorityCount + index, 0, testTasksFunc);
          } else {
            config.queue.push(testTasksFunc);
          }
        }
        function unitSamplerGenerator(seed) {
          var sample = parseInt(generateHash(seed), 16) || -1;
          return function() {
            sample ^= sample << 13;
            sample ^= sample >>> 17;
            sample ^= sample << 5;
            if (sample < 0) {
              sample += 4294967296;
            }
            return sample / 4294967296;
          };
        }
        function done() {
          var storage = config.storage;
          ProcessingQueue.finished = true;
          var runtime = now() - config.started;
          var passed = config.stats.all - config.stats.bad;
          if (config.stats.testCount === 0 && config.failOnZeroTests === true) {
            if (config.filter && config.filter.length) {
              throw new Error('No tests matched the filter "'.concat(config.filter, '".'));
            }
            if (config.module && config.module.length) {
              throw new Error('No tests matched the module "'.concat(config.module, '".'));
            }
            if (config.moduleId && config.moduleId.length) {
              throw new Error('No tests matched the moduleId "'.concat(config.moduleId, '".'));
            }
            if (config.testId && config.testId.length) {
              throw new Error('No tests matched the testId "'.concat(config.testId, '".'));
            }
            throw new Error("No tests were run.");
          }
          emit("runEnd", globalSuite.end(true));
          runLoggingCallbacks("done", {
            passed,
            failed: config.stats.bad,
            total: config.stats.all,
            runtime
          }).then(function() {
            if (storage && config.stats.bad === 0) {
              for (var i = storage.length - 1; i >= 0; i--) {
                var key = storage.key(i);
                if (key.indexOf("qunit-test-") === 0) {
                  storage.removeItem(key);
                }
              }
            }
          });
        }
        var ProcessingQueue = {
          finished: false,
          add: addToTestQueue,
          advance,
          taskCount: taskQueueLength
        };
        var TestReport = /* @__PURE__ */ function() {
          function TestReport2(name, suite, options) {
            _classCallCheck(this, TestReport2);
            this.name = name;
            this.suiteName = suite.name;
            this.fullName = suite.fullName.concat(name);
            this.runtime = 0;
            this.assertions = [];
            this.skipped = !!options.skip;
            this.todo = !!options.todo;
            this.valid = options.valid;
            this._startTime = 0;
            this._endTime = 0;
            suite.pushTest(this);
          }
          _createClass(TestReport2, [{
            key: "start",
            value: function start(recordTime) {
              if (recordTime) {
                this._startTime = performance.now();
                performance.mark("qunit_test_start");
              }
              return {
                name: this.name,
                suiteName: this.suiteName,
                fullName: this.fullName.slice()
              };
            }
          }, {
            key: "end",
            value: function end(recordTime) {
              if (recordTime) {
                this._endTime = performance.now();
                if (performance) {
                  performance.mark("qunit_test_end");
                  var testName = this.fullName.join(" \u2013 ");
                  performance.measure("QUnit Test: ".concat(testName), "qunit_test_start", "qunit_test_end");
                }
              }
              return extend(this.start(), {
                runtime: this.getRuntime(),
                status: this.getStatus(),
                errors: this.getFailedAssertions(),
                assertions: this.getAssertions()
              });
            }
          }, {
            key: "pushAssertion",
            value: function pushAssertion(assertion) {
              this.assertions.push(assertion);
            }
          }, {
            key: "getRuntime",
            value: function getRuntime() {
              return this._endTime - this._startTime;
            }
          }, {
            key: "getStatus",
            value: function getStatus() {
              if (this.skipped) {
                return "skipped";
              }
              var testPassed = this.getFailedAssertions().length > 0 ? this.todo : !this.todo;
              if (!testPassed) {
                return "failed";
              } else if (this.todo) {
                return "todo";
              } else {
                return "passed";
              }
            }
          }, {
            key: "getFailedAssertions",
            value: function getFailedAssertions() {
              return this.assertions.filter(function(assertion) {
                return !assertion.passed;
              });
            }
          }, {
            key: "getAssertions",
            value: function getAssertions() {
              return this.assertions.slice();
            }
          }, {
            key: "slimAssertions",
            value: function slimAssertions() {
              this.assertions = this.assertions.map(function(assertion) {
                delete assertion.actual;
                delete assertion.expected;
                return assertion;
              });
            }
          }]);
          return TestReport2;
        }();
        function Test(settings) {
          this.expected = null;
          this.assertions = [];
          this.semaphore = 0;
          this.module = config.currentModule;
          this.steps = [];
          this.timeout = void 0;
          this.data = void 0;
          this.withData = false;
          extend(this, settings);
          if (this.module.skip) {
            this.skip = true;
            this.todo = false;
          } else if (this.module.todo && !this.skip) {
            this.todo = true;
          }
          if (!this.skip && typeof this.callback !== "function") {
            var method = this.todo ? "QUnit.todo" : "QUnit.test";
            throw new TypeError("You must provide a callback to ".concat(method, '("').concat(this.testName, '")'));
          }
          ++Test.count;
          this.errorForStack = new Error();
          this.testReport = new TestReport(this.testName, this.module.suiteReport, {
            todo: this.todo,
            skip: this.skip,
            valid: this.valid()
          });
          for (var i = 0, l = this.module.tests; i < l.length; i++) {
            if (this.module.tests[i].name === this.testName) {
              this.testName += " ";
            }
          }
          this.testId = generateHash(this.module.name, this.testName);
          this.module.tests.push({
            name: this.testName,
            testId: this.testId,
            skip: !!this.skip
          });
          if (this.skip) {
            this.callback = function() {
            };
            this.async = false;
            this.expected = 0;
          } else {
            this.assert = new Assert(this);
          }
        }
        Test.count = 0;
        function getNotStartedModules(startModule) {
          var module2 = startModule;
          var modules = [];
          while (module2 && module2.testsRun === 0) {
            modules.push(module2);
            module2 = module2.parentModule;
          }
          return modules.reverse();
        }
        Test.prototype = {
          get stack() {
            return extractStacktrace(this.errorForStack, 2);
          },
          before: function before() {
            var _this = this;
            var module2 = this.module;
            var notStartedModules = getNotStartedModules(module2);
            var callbackPromises = notStartedModules.reduce(function(promiseChain, startModule) {
              return promiseChain.then(function() {
                startModule.stats = {
                  all: 0,
                  bad: 0,
                  started: now()
                };
                emit("suiteStart", startModule.suiteReport.start(true));
                return runLoggingCallbacks("moduleStart", {
                  name: startModule.name,
                  tests: startModule.tests
                });
              });
            }, _Promise.resolve([]));
            return callbackPromises.then(function() {
              config.current = _this;
              _this.testEnvironment = extend({}, module2.testEnvironment);
              _this.started = now();
              emit("testStart", _this.testReport.start(true));
              return runLoggingCallbacks("testStart", {
                name: _this.testName,
                module: module2.name,
                testId: _this.testId,
                previousFailure: _this.previousFailure
              }).then(function() {
                if (!config.pollution) {
                  saveGlobal();
                }
              });
            });
          },
          run: function run2() {
            config.current = this;
            this.callbackStarted = now();
            if (config.notrycatch) {
              runTest(this);
              return;
            }
            try {
              runTest(this);
            } catch (e) {
              this.pushFailure("Died on test #" + (this.assertions.length + 1) + " " + this.stack + ": " + (e.message || e), extractStacktrace(e, 0));
              saveGlobal();
              if (config.blocking) {
                internalRecover(this);
              }
            }
            function runTest(test2) {
              var promise;
              if (test2.withData) {
                promise = test2.callback.call(test2.testEnvironment, test2.assert, test2.data);
              } else {
                promise = test2.callback.call(test2.testEnvironment, test2.assert);
              }
              test2.resolvePromise(promise);
              if (test2.timeout === 0 && test2.semaphore !== 0) {
                pushFailure("Test did not finish synchronously even though assert.timeout( 0 ) was used.", sourceFromStacktrace(2));
              }
            }
          },
          after: function after() {
            checkPollution();
          },
          queueHook: function queueHook(hook, hookName, hookOwner) {
            var _this2 = this;
            var callHook = function callHook2() {
              var promise = hook.call(_this2.testEnvironment, _this2.assert);
              _this2.resolvePromise(promise, hookName);
            };
            var runHook = function runHook2() {
              if (hookName === "before") {
                if (hookOwner.testsRun !== 0) {
                  return;
                }
                _this2.preserveEnvironment = true;
              }
              if (hookName === "after" && !lastTestWithinModuleExecuted(hookOwner) && (config.queue.length > 0 || ProcessingQueue.taskCount() > 2)) {
                return;
              }
              config.current = _this2;
              if (config.notrycatch) {
                callHook();
                return;
              }
              try {
                callHook();
              } catch (error) {
                _this2.pushFailure(hookName + " failed on " + _this2.testName + ": " + (error.message || error), extractStacktrace(error, 0));
              }
            };
            return runHook;
          },
          hooks: function hooks(handler) {
            var hooks2 = [];
            function processHooks(test2, module2) {
              if (module2.parentModule) {
                processHooks(test2, module2.parentModule);
              }
              if (module2.hooks[handler].length) {
                for (var i = 0; i < module2.hooks[handler].length; i++) {
                  hooks2.push(test2.queueHook(module2.hooks[handler][i], handler, module2));
                }
              }
            }
            if (!this.skip) {
              processHooks(this, this.module);
            }
            return hooks2;
          },
          finish: function finish() {
            config.current = this;
            this.callback = void 0;
            if (this.steps.length) {
              var stepsList = this.steps.join(", ");
              this.pushFailure("Expected assert.verifySteps() to be called before end of test " + "after using assert.step(). Unverified steps: ".concat(stepsList), this.stack);
            }
            if (config.requireExpects && this.expected === null) {
              this.pushFailure("Expected number of assertions to be defined, but expect() was not called.", this.stack);
            } else if (this.expected !== null && this.expected !== this.assertions.length) {
              this.pushFailure("Expected " + this.expected + " assertions, but " + this.assertions.length + " were run", this.stack);
            } else if (this.expected === null && !this.assertions.length) {
              this.pushFailure("Expected at least one assertion, but none were run - call expect(0) to accept zero assertions.", this.stack);
            }
            var module2 = this.module;
            var moduleName = module2.name;
            var testName = this.testName;
            var skipped = !!this.skip;
            var todo = !!this.todo;
            var bad = 0;
            var storage = config.storage;
            this.runtime = now() - this.started;
            config.stats.all += this.assertions.length;
            config.stats.testCount += 1;
            module2.stats.all += this.assertions.length;
            for (var i = 0; i < this.assertions.length; i++) {
              if (!this.assertions[i].result) {
                bad++;
                config.stats.bad++;
                module2.stats.bad++;
              }
            }
            if (skipped) {
              incrementTestsIgnored(module2);
            } else {
              incrementTestsRun(module2);
            }
            if (storage) {
              if (bad) {
                storage.setItem("qunit-test-" + moduleName + "-" + testName, bad);
              } else {
                storage.removeItem("qunit-test-" + moduleName + "-" + testName);
              }
            }
            emit("testEnd", this.testReport.end(true));
            this.testReport.slimAssertions();
            var test2 = this;
            return runLoggingCallbacks("testDone", {
              name: testName,
              module: moduleName,
              skipped,
              todo,
              failed: bad,
              passed: this.assertions.length - bad,
              total: this.assertions.length,
              runtime: skipped ? 0 : this.runtime,
              assertions: this.assertions,
              testId: this.testId,
              get source() {
                return test2.stack;
              }
            }).then(function() {
              if (allTestsExecuted(module2)) {
                var completedModules = [module2];
                var parent = module2.parentModule;
                while (parent && allTestsExecuted(parent)) {
                  completedModules.push(parent);
                  parent = parent.parentModule;
                }
                return completedModules.reduce(function(promiseChain, completedModule) {
                  return promiseChain.then(function() {
                    return logSuiteEnd(completedModule);
                  });
                }, _Promise.resolve([]));
              }
            }).then(function() {
              config.current = void 0;
            });
            function logSuiteEnd(module3) {
              module3.hooks = {};
              emit("suiteEnd", module3.suiteReport.end(true));
              return runLoggingCallbacks("moduleDone", {
                name: module3.name,
                tests: module3.tests,
                failed: module3.stats.bad,
                passed: module3.stats.all - module3.stats.bad,
                total: module3.stats.all,
                runtime: now() - module3.stats.started
              });
            }
          },
          preserveTestEnvironment: function preserveTestEnvironment() {
            if (this.preserveEnvironment) {
              this.module.testEnvironment = this.testEnvironment;
              this.testEnvironment = extend({}, this.module.testEnvironment);
            }
          },
          queue: function queue() {
            var test2 = this;
            if (!this.valid()) {
              incrementTestsIgnored(this.module);
              return;
            }
            function runTest() {
              return [function() {
                return test2.before();
              }].concat(_toConsumableArray(test2.hooks("before")), [function() {
                test2.preserveTestEnvironment();
              }], _toConsumableArray(test2.hooks("beforeEach")), [function() {
                test2.run();
              }], _toConsumableArray(test2.hooks("afterEach").reverse()), _toConsumableArray(test2.hooks("after").reverse()), [function() {
                test2.after();
              }, function() {
                return test2.finish();
              }]);
            }
            var previousFailCount = config.storage && +config.storage.getItem("qunit-test-" + this.module.name + "-" + this.testName);
            var prioritize = config.reorder && !!previousFailCount;
            this.previousFailure = !!previousFailCount;
            ProcessingQueue.add(runTest, prioritize, config.seed);
            if (ProcessingQueue.finished) {
              ProcessingQueue.advance();
            }
          },
          pushResult: function pushResult(resultInfo) {
            if (this !== config.current) {
              var message = resultInfo && resultInfo.message || "";
              var testName = this && this.testName || "";
              var error = "Assertion occurred after test finished.\n> Test: " + testName + "\n> Message: " + message + "\n";
              throw new Error(error);
            }
            var details = {
              module: this.module.name,
              name: this.testName,
              result: resultInfo.result,
              message: resultInfo.message,
              actual: resultInfo.actual,
              testId: this.testId,
              negative: resultInfo.negative || false,
              runtime: now() - this.started,
              todo: !!this.todo
            };
            if (hasOwn$1.call(resultInfo, "expected")) {
              details.expected = resultInfo.expected;
            }
            if (!resultInfo.result) {
              var source = resultInfo.source || sourceFromStacktrace();
              if (source) {
                details.source = source;
              }
            }
            this.logAssertion(details);
            this.assertions.push({
              result: !!resultInfo.result,
              message: resultInfo.message
            });
          },
          pushFailure: function pushFailure2(message, source, actual) {
            if (!(this instanceof Test)) {
              throw new Error("pushFailure() assertion outside test context, was " + sourceFromStacktrace(2));
            }
            this.pushResult({
              result: false,
              message: message || "error",
              actual: actual || null,
              source
            });
          },
          logAssertion: function logAssertion(details) {
            runLoggingCallbacks("log", details);
            var assertion = {
              passed: details.result,
              actual: details.actual,
              expected: details.expected,
              message: details.message,
              stack: details.source,
              todo: details.todo
            };
            this.testReport.pushAssertion(assertion);
            emit("assertion", assertion);
          },
          resolvePromise: function resolvePromise(promise, phase) {
            if (promise != null) {
              var _test = this;
              var then = promise.then;
              if (objectType(then) === "function") {
                var resume = internalStop(_test);
                var resolve = function resolve2() {
                  resume();
                };
                if (config.notrycatch) {
                  then.call(promise, resolve);
                } else {
                  var reject = function reject2(error) {
                    var message = "Promise rejected " + (!phase ? "during" : phase.replace(/Each$/, "")) + ' "' + _test.testName + '": ' + (error && error.message || error);
                    _test.pushFailure(message, extractStacktrace(error, 0));
                    saveGlobal();
                    internalRecover(_test);
                  };
                  then.call(promise, resolve, reject);
                }
              }
            }
          },
          valid: function valid() {
            var filter = config.filter;
            var regexFilter = /^(!?)\/([\w\W]*)\/(i?$)/.exec(filter);
            var module2 = config.module && config.module.toLowerCase();
            var fullName = this.module.name + ": " + this.testName;
            function moduleChainNameMatch(testModule) {
              var testModuleName = testModule.name ? testModule.name.toLowerCase() : null;
              if (testModuleName === module2) {
                return true;
              } else if (testModule.parentModule) {
                return moduleChainNameMatch(testModule.parentModule);
              } else {
                return false;
              }
            }
            function moduleChainIdMatch(testModule) {
              return inArray(testModule.moduleId, config.moduleId) || testModule.parentModule && moduleChainIdMatch(testModule.parentModule);
            }
            if (this.callback && this.callback.validTest) {
              return true;
            }
            if (config.moduleId && config.moduleId.length > 0 && !moduleChainIdMatch(this.module)) {
              return false;
            }
            if (config.testId && config.testId.length > 0 && !inArray(this.testId, config.testId)) {
              return false;
            }
            if (module2 && !moduleChainNameMatch(this.module)) {
              return false;
            }
            if (!filter) {
              return true;
            }
            return regexFilter ? this.regexFilter(!!regexFilter[1], regexFilter[2], regexFilter[3], fullName) : this.stringFilter(filter, fullName);
          },
          regexFilter: function regexFilter(exclude, pattern, flags, fullName) {
            var regex = new RegExp(pattern, flags);
            var match = regex.test(fullName);
            return match !== exclude;
          },
          stringFilter: function stringFilter(filter, fullName) {
            filter = filter.toLowerCase();
            fullName = fullName.toLowerCase();
            var include = filter.charAt(0) !== "!";
            if (!include) {
              filter = filter.slice(1);
            }
            if (fullName.indexOf(filter) !== -1) {
              return include;
            }
            return !include;
          }
        };
        function pushFailure() {
          if (!config.current) {
            throw new Error("pushFailure() assertion outside test context, in " + sourceFromStacktrace(2));
          }
          var currentTest = config.current;
          return currentTest.pushFailure.apply(currentTest, arguments);
        }
        function saveGlobal() {
          config.pollution = [];
          if (config.noglobals) {
            for (var key in globalThis$1) {
              if (hasOwn$1.call(globalThis$1, key)) {
                if (/^qunit-test-output/.test(key)) {
                  continue;
                }
                config.pollution.push(key);
              }
            }
          }
        }
        function checkPollution() {
          var old = config.pollution;
          saveGlobal();
          var newGlobals = diff(config.pollution, old);
          if (newGlobals.length > 0) {
            pushFailure("Introduced global variable(s): " + newGlobals.join(", "));
          }
          var deletedGlobals = diff(old, config.pollution);
          if (deletedGlobals.length > 0) {
            pushFailure("Deleted global variable(s): " + deletedGlobals.join(", "));
          }
        }
        var focused = false;
        function addTest(settings) {
          if (focused || config.currentModule.ignored) {
            return;
          }
          var newTest = new Test(settings);
          newTest.queue();
        }
        function addOnlyTest(settings) {
          if (config.currentModule.ignored) {
            return;
          }
          if (!focused) {
            config.queue.length = 0;
            focused = true;
          }
          var newTest = new Test(settings);
          newTest.queue();
        }
        function test(testName, callback) {
          addTest({
            testName,
            callback
          });
        }
        function makeEachTestName(testName, argument) {
          return "".concat(testName, " [").concat(argument, "]");
        }
        function runEach(data, eachFn) {
          if (Array.isArray(data)) {
            data.forEach(eachFn);
          } else if (_typeof(data) === "object" && data !== null) {
            var keys = Object.keys(data);
            keys.forEach(function(key) {
              eachFn(data[key], key);
            });
          } else {
            throw new Error("test.each() expects an array or object as input, but\nfound ".concat(_typeof(data), " instead."));
          }
        }
        extend(test, {
          todo: function todo(testName, callback) {
            addTest({
              testName,
              callback,
              todo: true
            });
          },
          skip: function skip(testName) {
            addTest({
              testName,
              skip: true
            });
          },
          only: function only(testName, callback) {
            addOnlyTest({
              testName,
              callback
            });
          },
          each: function each(testName, dataset, callback) {
            runEach(dataset, function(data, testKey) {
              addTest({
                testName: makeEachTestName(testName, testKey),
                callback,
                withData: true,
                data
              });
            });
          }
        });
        test.todo.each = function(testName, dataset, callback) {
          runEach(dataset, function(data, testKey) {
            addTest({
              testName: makeEachTestName(testName, testKey),
              callback,
              todo: true,
              withData: true,
              data
            });
          });
        };
        test.skip.each = function(testName, dataset) {
          runEach(dataset, function(_, testKey) {
            addTest({
              testName: makeEachTestName(testName, testKey),
              skip: true
            });
          });
        };
        test.only.each = function(testName, dataset, callback) {
          runEach(dataset, function(data, testKey) {
            addOnlyTest({
              testName: makeEachTestName(testName, testKey),
              callback,
              withData: true,
              data
            });
          });
        };
        function resetTestTimeout(timeoutDuration) {
          clearTimeout(config.timeout);
          config.timeout = setTimeout$1(config.timeoutHandler(timeoutDuration), timeoutDuration);
        }
        function internalStop(test2) {
          var released = false;
          test2.semaphore += 1;
          config.blocking = true;
          if (setTimeout$1) {
            var timeoutDuration;
            if (typeof test2.timeout === "number") {
              timeoutDuration = test2.timeout;
            } else if (typeof config.testTimeout === "number") {
              timeoutDuration = config.testTimeout;
            }
            if (typeof timeoutDuration === "number" && timeoutDuration > 0) {
              config.timeoutHandler = function(timeout) {
                return function() {
                  config.timeout = null;
                  pushFailure("Test took longer than ".concat(timeout, "ms; test timed out."), sourceFromStacktrace(2));
                  released = true;
                  internalRecover(test2);
                };
              };
              clearTimeout(config.timeout);
              config.timeout = setTimeout$1(config.timeoutHandler(timeoutDuration), timeoutDuration);
            }
          }
          return function resume() {
            if (released) {
              return;
            }
            released = true;
            test2.semaphore -= 1;
            internalStart(test2);
          };
        }
        function internalRecover(test2) {
          test2.semaphore = 0;
          internalStart(test2);
        }
        function internalStart(test2) {
          if (isNaN(test2.semaphore)) {
            test2.semaphore = 0;
            pushFailure("Invalid value on test.semaphore", sourceFromStacktrace(2));
          }
          if (test2.semaphore > 0) {
            return;
          }
          if (test2.semaphore < 0) {
            test2.semaphore = 0;
            pushFailure("Tried to restart test while already started (test's semaphore was 0 already)", sourceFromStacktrace(2));
          }
          if (setTimeout$1) {
            clearTimeout(config.timeout);
            config.timeout = setTimeout$1(function() {
              if (test2.semaphore > 0) {
                return;
              }
              clearTimeout(config.timeout);
              config.timeout = null;
              begin();
            });
          } else {
            begin();
          }
        }
        function collectTests(module2) {
          var tests = [].concat(module2.tests);
          var modules = _toConsumableArray(module2.childModules);
          while (modules.length) {
            var nextModule = modules.shift();
            tests.push.apply(tests, nextModule.tests);
            modules.push.apply(modules, _toConsumableArray(nextModule.childModules));
          }
          return tests;
        }
        function allTestsExecuted(module2) {
          return module2.testsRun + module2.testsIgnored === collectTests(module2).length;
        }
        function lastTestWithinModuleExecuted(module2) {
          return module2.testsRun === collectTests(module2).filter(function(test2) {
            return !test2.skip;
          }).length - 1;
        }
        function incrementTestsRun(module2) {
          module2.testsRun++;
          while (module2 = module2.parentModule) {
            module2.testsRun++;
          }
        }
        function incrementTestsIgnored(module2) {
          module2.testsIgnored++;
          while (module2 = module2.parentModule) {
            module2.testsIgnored++;
          }
        }
        var Assert = /* @__PURE__ */ function() {
          function Assert2(testContext) {
            _classCallCheck(this, Assert2);
            this.test = testContext;
          }
          _createClass(Assert2, [{
            key: "timeout",
            value: function timeout(duration) {
              if (typeof duration !== "number") {
                throw new Error("You must pass a number as the duration to assert.timeout");
              }
              this.test.timeout = duration;
              if (config.timeout) {
                clearTimeout(config.timeout);
                config.timeout = null;
                if (config.timeoutHandler && this.test.timeout > 0) {
                  resetTestTimeout(this.test.timeout);
                }
              }
            }
          }, {
            key: "step",
            value: function step(message) {
              var assertionMessage = message;
              var result = !!message;
              this.test.steps.push(message);
              if (objectType(message) === "undefined" || message === "") {
                assertionMessage = "You must provide a message to assert.step";
              } else if (objectType(message) !== "string") {
                assertionMessage = "You must provide a string value to assert.step";
                result = false;
              }
              this.pushResult({
                result,
                message: assertionMessage
              });
            }
          }, {
            key: "verifySteps",
            value: function verifySteps(steps, message) {
              var actualStepsClone = this.test.steps.slice();
              this.deepEqual(actualStepsClone, steps, message);
              this.test.steps.length = 0;
            }
          }, {
            key: "expect",
            value: function expect(asserts) {
              if (arguments.length === 1) {
                this.test.expected = asserts;
              } else {
                return this.test.expected;
              }
            }
          }, {
            key: "async",
            value: function async(count) {
              var test2 = this.test;
              var popped = false, acceptCallCount = count;
              if (typeof acceptCallCount === "undefined") {
                acceptCallCount = 1;
              }
              var resume = internalStop(test2);
              return function done2() {
                if (config.current === void 0) {
                  throw new Error('`assert.async` callback from test "' + test2.testName + '" called after tests finished.');
                }
                if (config.current !== test2) {
                  config.current.pushFailure('`assert.async` callback from test "' + test2.testName + '" was called during this test.');
                  return;
                }
                if (popped) {
                  test2.pushFailure("Too many calls to the `assert.async` callback", sourceFromStacktrace(2));
                  return;
                }
                acceptCallCount -= 1;
                if (acceptCallCount > 0) {
                  return;
                }
                popped = true;
                resume();
              };
            }
          }, {
            key: "push",
            value: function push(result, actual, expected, message, negative) {
              Logger.warn("assert.push is deprecated and will be removed in QUnit 3.0. Please use assert.pushResult instead (https://api.qunitjs.com/assert/pushResult).");
              var currentAssert = this instanceof Assert2 ? this : config.current.assert;
              return currentAssert.pushResult({
                result,
                actual,
                expected,
                message,
                negative
              });
            }
          }, {
            key: "pushResult",
            value: function pushResult(resultInfo) {
              var assert = this;
              var currentTest = assert instanceof Assert2 && assert.test || config.current;
              if (!currentTest) {
                throw new Error("assertion outside test context, in " + sourceFromStacktrace(2));
              }
              if (!(assert instanceof Assert2)) {
                assert = currentTest.assert;
              }
              return assert.test.pushResult(resultInfo);
            }
          }, {
            key: "ok",
            value: function ok(result, message) {
              if (!message) {
                message = result ? "okay" : "failed, expected argument to be truthy, was: ".concat(dump.parse(result));
              }
              this.pushResult({
                result: !!result,
                actual: result,
                expected: true,
                message
              });
            }
          }, {
            key: "notOk",
            value: function notOk(result, message) {
              if (!message) {
                message = !result ? "okay" : "failed, expected argument to be falsy, was: ".concat(dump.parse(result));
              }
              this.pushResult({
                result: !result,
                actual: result,
                expected: false,
                message
              });
            }
          }, {
            key: "true",
            value: function _true(result, message) {
              this.pushResult({
                result: result === true,
                actual: result,
                expected: true,
                message
              });
            }
          }, {
            key: "false",
            value: function _false(result, message) {
              this.pushResult({
                result: result === false,
                actual: result,
                expected: false,
                message
              });
            }
          }, {
            key: "equal",
            value: function equal(actual, expected, message) {
              var result = expected == actual;
              this.pushResult({
                result,
                actual,
                expected,
                message
              });
            }
          }, {
            key: "notEqual",
            value: function notEqual(actual, expected, message) {
              var result = expected != actual;
              this.pushResult({
                result,
                actual,
                expected,
                message,
                negative: true
              });
            }
          }, {
            key: "propEqual",
            value: function propEqual(actual, expected, message) {
              actual = objectValues(actual);
              expected = objectValues(expected);
              this.pushResult({
                result: equiv(actual, expected),
                actual,
                expected,
                message
              });
            }
          }, {
            key: "notPropEqual",
            value: function notPropEqual(actual, expected, message) {
              actual = objectValues(actual);
              expected = objectValues(expected);
              this.pushResult({
                result: !equiv(actual, expected),
                actual,
                expected,
                message,
                negative: true
              });
            }
          }, {
            key: "deepEqual",
            value: function deepEqual(actual, expected, message) {
              this.pushResult({
                result: equiv(actual, expected),
                actual,
                expected,
                message
              });
            }
          }, {
            key: "notDeepEqual",
            value: function notDeepEqual(actual, expected, message) {
              this.pushResult({
                result: !equiv(actual, expected),
                actual,
                expected,
                message,
                negative: true
              });
            }
          }, {
            key: "strictEqual",
            value: function strictEqual(actual, expected, message) {
              this.pushResult({
                result: expected === actual,
                actual,
                expected,
                message
              });
            }
          }, {
            key: "notStrictEqual",
            value: function notStrictEqual(actual, expected, message) {
              this.pushResult({
                result: expected !== actual,
                actual,
                expected,
                message,
                negative: true
              });
            }
          }, {
            key: "throws",
            value: function throws(block, expected, message) {
              var actual, result = false;
              var currentTest = this instanceof Assert2 && this.test || config.current;
              if (objectType(expected) === "string") {
                if (message == null) {
                  message = expected;
                  expected = null;
                } else {
                  throw new Error("throws/raises does not accept a string value for the expected argument.\nUse a non-string object value (e.g. regExp) instead if it's necessary.");
                }
              }
              currentTest.ignoreGlobalErrors = true;
              try {
                block.call(currentTest.testEnvironment);
              } catch (e) {
                actual = e;
              }
              currentTest.ignoreGlobalErrors = false;
              if (actual) {
                var expectedType = objectType(expected);
                if (!expected) {
                  result = true;
                } else if (expectedType === "regexp") {
                  result = expected.test(errorString(actual));
                  expected = String(expected);
                } else if (expectedType === "function" && expected.prototype !== void 0 && actual instanceof expected) {
                  result = true;
                } else if (expectedType === "object") {
                  result = actual instanceof expected.constructor && actual.name === expected.name && actual.message === expected.message;
                  expected = errorString(expected);
                } else if (expectedType === "function") {
                  try {
                    result = expected.call({}, actual) === true;
                    expected = null;
                  } catch (e) {
                    expected = errorString(e);
                  }
                }
              }
              currentTest.assert.pushResult({
                result,
                actual: actual && errorString(actual),
                expected,
                message
              });
            }
          }, {
            key: "rejects",
            value: function rejects(promise, expected, message) {
              var result = false;
              var currentTest = this instanceof Assert2 && this.test || config.current;
              if (objectType(expected) === "string") {
                if (message === void 0) {
                  message = expected;
                  expected = void 0;
                } else {
                  message = "assert.rejects does not accept a string value for the expected argument.\nUse a non-string object value (e.g. validator function) instead if necessary.";
                  currentTest.assert.pushResult({
                    result: false,
                    message
                  });
                  return;
                }
              }
              var then = promise && promise.then;
              if (objectType(then) !== "function") {
                var _message = 'The value provided to `assert.rejects` in "' + currentTest.testName + '" was not a promise.';
                currentTest.assert.pushResult({
                  result: false,
                  message: _message,
                  actual: promise
                });
                return;
              }
              var done2 = this.async();
              return then.call(promise, function handleFulfillment() {
                var message2 = 'The promise returned by the `assert.rejects` callback in "' + currentTest.testName + '" did not reject.';
                currentTest.assert.pushResult({
                  result: false,
                  message: message2,
                  actual: promise
                });
                done2();
              }, function handleRejection(actual) {
                var expectedType = objectType(expected);
                if (expected === void 0) {
                  result = true;
                } else if (expectedType === "regexp") {
                  result = expected.test(errorString(actual));
                  expected = String(expected);
                } else if (expectedType === "function" && actual instanceof expected) {
                  result = true;
                } else if (expectedType === "object") {
                  result = actual instanceof expected.constructor && actual.name === expected.name && actual.message === expected.message;
                  expected = errorString(expected);
                } else {
                  if (expectedType === "function") {
                    result = expected.call({}, actual) === true;
                    expected = null;
                  } else {
                    result = false;
                    message = 'invalid expected value provided to `assert.rejects` callback in "' + currentTest.testName + '": ' + expectedType + ".";
                  }
                }
                currentTest.assert.pushResult({
                  result,
                  actual: actual && errorString(actual),
                  expected,
                  message
                });
                done2();
              });
            }
          }]);
          return Assert2;
        }();
        Assert.prototype.raises = Assert.prototype["throws"];
        function errorString(error) {
          var resultErrorString = error.toString();
          if (resultErrorString.slice(0, 7) === "[object") {
            var name = error.name ? String(error.name) : "Error";
            return error.message ? "".concat(name, ": ").concat(error.message) : name;
          } else {
            return resultErrorString;
          }
        }
        function exportQUnit(QUnit2) {
          var exportedModule = false;
          if (window$1 && document) {
            if (window$1.QUnit && window$1.QUnit.version) {
              throw new Error("QUnit has already been defined.");
            }
            window$1.QUnit = QUnit2;
            exportedModule = true;
          }
          if (typeof module !== "undefined" && module && module.exports) {
            module.exports = QUnit2;
            module.exports.QUnit = QUnit2;
            exportedModule = true;
          }
          if (typeof exports !== "undefined" && exports) {
            exports.QUnit = QUnit2;
            exportedModule = true;
          }
          if (typeof define === "function" && define.amd) {
            define(function() {
              return QUnit2;
            });
            QUnit2.config.autostart = false;
            exportedModule = true;
          }
          if (self$1 && self$1.WorkerGlobalScope && self$1 instanceof self$1.WorkerGlobalScope) {
            self$1.QUnit = QUnit2;
            exportedModule = true;
          }
          if (!exportedModule) {
            globalThis$1.QUnit = QUnit2;
          }
        }
        var ConsoleReporter = /* @__PURE__ */ function() {
          function ConsoleReporter2(runner) {
            var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
            _classCallCheck(this, ConsoleReporter2);
            this.log = options.log || Function.prototype.bind.call(console$1.log, console$1);
            runner.on("runStart", this.onRunStart.bind(this));
            runner.on("testStart", this.onTestStart.bind(this));
            runner.on("testEnd", this.onTestEnd.bind(this));
            runner.on("runEnd", this.onRunEnd.bind(this));
          }
          _createClass(ConsoleReporter2, [{
            key: "onRunStart",
            value: function onRunStart(runStart) {
              this.log("runStart", runStart);
            }
          }, {
            key: "onTestStart",
            value: function onTestStart(test2) {
              this.log("testStart", test2);
            }
          }, {
            key: "onTestEnd",
            value: function onTestEnd(test2) {
              this.log("testEnd", test2);
            }
          }, {
            key: "onRunEnd",
            value: function onRunEnd(runEnd) {
              this.log("runEnd", runEnd);
            }
          }], [{
            key: "init",
            value: function init2(runner, options) {
              return new ConsoleReporter2(runner, options);
            }
          }]);
          return ConsoleReporter2;
        }();
        var FORCE_COLOR, NODE_DISABLE_COLORS, NO_COLOR, TERM, isTTY = true;
        if (typeof process !== "undefined") {
          var _process$env = process.env;
          FORCE_COLOR = _process$env.FORCE_COLOR;
          NODE_DISABLE_COLORS = _process$env.NODE_DISABLE_COLORS;
          NO_COLOR = _process$env.NO_COLOR;
          TERM = _process$env.TERM;
          isTTY = process.stdout && process.stdout.isTTY;
        }
        var $ = {
          enabled: !NODE_DISABLE_COLORS && NO_COLOR == null && TERM !== "dumb" && (FORCE_COLOR != null && FORCE_COLOR !== "0" || isTTY),
          reset: init(0, 0),
          bold: init(1, 22),
          dim: init(2, 22),
          italic: init(3, 23),
          underline: init(4, 24),
          inverse: init(7, 27),
          hidden: init(8, 28),
          strikethrough: init(9, 29),
          black: init(30, 39),
          red: init(31, 39),
          green: init(32, 39),
          yellow: init(33, 39),
          blue: init(34, 39),
          magenta: init(35, 39),
          cyan: init(36, 39),
          white: init(37, 39),
          gray: init(90, 39),
          grey: init(90, 39),
          bgBlack: init(40, 49),
          bgRed: init(41, 49),
          bgGreen: init(42, 49),
          bgYellow: init(43, 49),
          bgBlue: init(44, 49),
          bgMagenta: init(45, 49),
          bgCyan: init(46, 49),
          bgWhite: init(47, 49)
        };
        function run(arr, str) {
          var i = 0, tmp, beg = "", end = "";
          for (; i < arr.length; i++) {
            tmp = arr[i];
            beg += tmp.open;
            end += tmp.close;
            if (!!~str.indexOf(tmp.close)) {
              str = str.replace(tmp.rgx, tmp.close + tmp.open);
            }
          }
          return beg + str + end;
        }
        function chain(has, keys) {
          var ctx = {
            has,
            keys
          };
          ctx.reset = $.reset.bind(ctx);
          ctx.bold = $.bold.bind(ctx);
          ctx.dim = $.dim.bind(ctx);
          ctx.italic = $.italic.bind(ctx);
          ctx.underline = $.underline.bind(ctx);
          ctx.inverse = $.inverse.bind(ctx);
          ctx.hidden = $.hidden.bind(ctx);
          ctx.strikethrough = $.strikethrough.bind(ctx);
          ctx.black = $.black.bind(ctx);
          ctx.red = $.red.bind(ctx);
          ctx.green = $.green.bind(ctx);
          ctx.yellow = $.yellow.bind(ctx);
          ctx.blue = $.blue.bind(ctx);
          ctx.magenta = $.magenta.bind(ctx);
          ctx.cyan = $.cyan.bind(ctx);
          ctx.white = $.white.bind(ctx);
          ctx.gray = $.gray.bind(ctx);
          ctx.grey = $.grey.bind(ctx);
          ctx.bgBlack = $.bgBlack.bind(ctx);
          ctx.bgRed = $.bgRed.bind(ctx);
          ctx.bgGreen = $.bgGreen.bind(ctx);
          ctx.bgYellow = $.bgYellow.bind(ctx);
          ctx.bgBlue = $.bgBlue.bind(ctx);
          ctx.bgMagenta = $.bgMagenta.bind(ctx);
          ctx.bgCyan = $.bgCyan.bind(ctx);
          ctx.bgWhite = $.bgWhite.bind(ctx);
          return ctx;
        }
        function init(open, close) {
          var blk = {
            open: "[".concat(open, "m"),
            close: "[".concat(close, "m"),
            rgx: new RegExp("\\x1b\\[".concat(close, "m"), "g")
          };
          return function(txt) {
            if (this !== void 0 && this.has !== void 0) {
              !!~this.has.indexOf(open) || (this.has.push(open), this.keys.push(blk));
              return txt === void 0 ? this : $.enabled ? run(this.keys, txt + "") : txt + "";
            }
            return txt === void 0 ? chain([open], [blk]) : $.enabled ? run([blk], txt + "") : txt + "";
          };
        }
        var hasOwn = Object.prototype.hasOwnProperty;
        function prettyYamlValue(value) {
          var indent = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 4;
          if (value === void 0) {
            value = String(value);
          }
          if (typeof value === "number" && !isFinite(value)) {
            value = String(value);
          }
          if (typeof value === "number") {
            return JSON.stringify(value);
          }
          if (typeof value === "string") {
            var rSpecialJson = /['"\\/[{}\]\r\n]/;
            var rSpecialYaml = /[-?:,[\]{}#&*!|=>'"%@`]/;
            var rUntrimmed = /(^\s|\s$)/;
            var rNumerical = /^[\d._-]+$/;
            var rBool = /^(true|false|y|n|yes|no|on|off)$/i;
            if (value === "" || rSpecialJson.test(value) || rSpecialYaml.test(value[0]) || rUntrimmed.test(value) || rNumerical.test(value) || rBool.test(value)) {
              if (!/\n/.test(value)) {
                return JSON.stringify(value);
              }
              var prefix = new Array(indent + 1).join(" ");
              var trailingLinebreakMatch = value.match(/\n+$/);
              var trailingLinebreaks = trailingLinebreakMatch ? trailingLinebreakMatch[0].length : 0;
              if (trailingLinebreaks === 1) {
                var lines = value.replace(/\n$/, "").split("\n").map(function(line) {
                  return prefix + line;
                });
                return "|\n" + lines.join("\n");
              } else {
                var _lines = value.split("\n").map(function(line) {
                  return prefix + line;
                });
                return "|+\n" + _lines.join("\n");
              }
            } else {
              return value;
            }
          }
          return JSON.stringify(decycledShallowClone(value), null, 2);
        }
        function decycledShallowClone(object) {
          var ancestors = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : [];
          if (ancestors.indexOf(object) !== -1) {
            return "[Circular]";
          }
          var clone;
          var type = Object.prototype.toString.call(object).replace(/^\[.+\s(.+?)]$/, "$1").toLowerCase();
          switch (type) {
            case "array":
              ancestors.push(object);
              clone = object.map(function(element) {
                return decycledShallowClone(element, ancestors);
              });
              ancestors.pop();
              break;
            case "object":
              ancestors.push(object);
              clone = {};
              Object.keys(object).forEach(function(key) {
                clone[key] = decycledShallowClone(object[key], ancestors);
              });
              ancestors.pop();
              break;
            default:
              clone = object;
          }
          return clone;
        }
        var TapReporter = /* @__PURE__ */ function() {
          function TapReporter2(runner) {
            var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
            _classCallCheck(this, TapReporter2);
            this.log = options.log || Function.prototype.bind.call(console$1.log, console$1);
            this.testCount = 0;
            runner.on("runStart", this.onRunStart.bind(this));
            runner.on("testEnd", this.onTestEnd.bind(this));
            runner.on("runEnd", this.onRunEnd.bind(this));
          }
          _createClass(TapReporter2, [{
            key: "onRunStart",
            value: function onRunStart(_globalSuite) {
              this.log("TAP version 13");
            }
          }, {
            key: "onTestEnd",
            value: function onTestEnd(test2) {
              var _this = this;
              this.testCount = this.testCount + 1;
              if (test2.status === "passed") {
                this.log("ok ".concat(this.testCount, " ").concat(test2.fullName.join(" > ")));
              } else if (test2.status === "skipped") {
                this.log($.yellow("ok ".concat(this.testCount, " # SKIP ").concat(test2.fullName.join(" > "))));
              } else if (test2.status === "todo") {
                this.log($.cyan("not ok ".concat(this.testCount, " # TODO ").concat(test2.fullName.join(" > "))));
                test2.errors.forEach(function(error) {
                  return _this.logError(error, "todo");
                });
              } else {
                this.log($.red("not ok ".concat(this.testCount, " ").concat(test2.fullName.join(" > "))));
                test2.errors.forEach(function(error) {
                  return _this.logError(error);
                });
              }
            }
          }, {
            key: "onRunEnd",
            value: function onRunEnd(globalSuite2) {
              this.log("1..".concat(globalSuite2.testCounts.total));
              this.log("# pass ".concat(globalSuite2.testCounts.passed));
              this.log($.yellow("# skip ".concat(globalSuite2.testCounts.skipped)));
              this.log($.cyan("# todo ".concat(globalSuite2.testCounts.todo)));
              this.log($.red("# fail ".concat(globalSuite2.testCounts.failed)));
            }
          }, {
            key: "logError",
            value: function logError(error, severity) {
              var out = "  ---";
              out += "\n  message: ".concat(prettyYamlValue(error.message || "failed"));
              out += "\n  severity: ".concat(prettyYamlValue(severity || "failed"));
              if (hasOwn.call(error, "actual")) {
                out += "\n  actual  : ".concat(prettyYamlValue(error.actual));
              }
              if (hasOwn.call(error, "expected")) {
                out += "\n  expected: ".concat(prettyYamlValue(error.expected));
              }
              if (error.stack) {
                out += "\n  stack: ".concat(prettyYamlValue(error.stack + "\n"));
              }
              out += "\n  ...";
              this.log(out);
            }
          }], [{
            key: "init",
            value: function init2(runner, options) {
              return new TapReporter2(runner, options);
            }
          }]);
          return TapReporter2;
        }();
        var reporters = {
          console: ConsoleReporter,
          tap: TapReporter
        };
        function onError(error) {
          for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
            args[_key - 1] = arguments[_key];
          }
          if (config.current) {
            if (config.current.ignoreGlobalErrors) {
              return true;
            }
            pushFailure.apply(void 0, [error.message, error.stacktrace || error.fileName + ":" + error.lineNumber].concat(args));
          } else {
            test("global failure", extend(function() {
              pushFailure.apply(void 0, [error.message, error.stacktrace || error.fileName + ":" + error.lineNumber].concat(args));
            }, {
              validTest: true
            }));
          }
          return false;
        }
        function onUnhandledRejection(reason) {
          var resultInfo = {
            result: false,
            message: reason.message || "error",
            actual: reason,
            source: reason.stack || sourceFromStacktrace(3)
          };
          var currentTest = config.current;
          if (currentTest) {
            currentTest.assert.pushResult(resultInfo);
          } else {
            test("global failure", extend(function(assert) {
              assert.pushResult(resultInfo);
            }, {
              validTest: true
            }));
          }
        }
        var QUnit = {};
        var globalSuite = new SuiteReport();
        config.currentModule.suiteReport = globalSuite;
        var globalStartCalled = false;
        var runStarted = false;
        QUnit.isLocal = window$1 && window$1.location && window$1.location.protocol === "file:";
        QUnit.version = "2.16.0";
        extend(QUnit, {
          config,
          dump,
          equiv,
          reporters,
          is,
          objectType,
          on,
          onError,
          onUnhandledRejection,
          pushFailure,
          assert: Assert.prototype,
          module: module$1,
          test,
          todo: test.todo,
          skip: test.skip,
          only: test.only,
          start: function start(count) {
            if (config.current) {
              throw new Error("QUnit.start cannot be called inside a test context.");
            }
            var globalStartAlreadyCalled = globalStartCalled;
            globalStartCalled = true;
            if (runStarted) {
              throw new Error("Called start() while test already started running");
            }
            if (globalStartAlreadyCalled || count > 1) {
              throw new Error("Called start() outside of a test context too many times");
            }
            if (config.autostart) {
              throw new Error("Called start() outside of a test context when QUnit.config.autostart was true");
            }
            if (!config.pageLoaded) {
              config.autostart = true;
              if (!document) {
                QUnit.load();
              }
              return;
            }
            scheduleBegin();
          },
          extend: function extend$1() {
            Logger.warn("QUnit.extend is deprecated and will be removed in QUnit 3.0. Please use Object.assign instead.");
            for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
              args[_key] = arguments[_key];
            }
            return extend.apply(this, args);
          },
          load: function load() {
            config.pageLoaded = true;
            extend(config, {
              stats: {
                all: 0,
                bad: 0,
                testCount: 0
              },
              started: 0,
              updateRate: 1e3,
              autostart: true,
              filter: ""
            }, true);
            if (!runStarted) {
              config.blocking = false;
              if (config.autostart) {
                scheduleBegin();
              }
            }
          },
          stack: function stack(offset) {
            offset = (offset || 0) + 2;
            return sourceFromStacktrace(offset);
          }
        });
        registerLoggingCallbacks(QUnit);
        function scheduleBegin() {
          runStarted = true;
          if (setTimeout$1) {
            setTimeout$1(function() {
              begin();
            });
          } else {
            begin();
          }
        }
        function unblockAndAdvanceQueue() {
          config.blocking = false;
          ProcessingQueue.advance();
        }
        function begin() {
          if (config.started) {
            unblockAndAdvanceQueue();
            return;
          }
          config.started = now();
          if (config.modules[0].name === "" && config.modules[0].tests.length === 0) {
            config.modules.shift();
          }
          var l = config.modules.length;
          var modulesLog = [];
          for (var i = 0; i < l; i++) {
            modulesLog.push({
              name: config.modules[i].name,
              tests: config.modules[i].tests
            });
          }
          emit("runStart", globalSuite.start(true));
          runLoggingCallbacks("begin", {
            totalTests: Test.count,
            modules: modulesLog
          }).then(unblockAndAdvanceQueue);
        }
        exportQUnit(QUnit);
        (function() {
          if (!window$1 || !document) {
            return;
          }
          var config2 = QUnit.config, hasOwn2 = Object.prototype.hasOwnProperty;
          function storeFixture() {
            if (hasOwn2.call(config2, "fixture")) {
              return;
            }
            var fixture = document.getElementById("qunit-fixture");
            if (fixture) {
              config2.fixture = fixture.cloneNode(true);
            }
          }
          QUnit.begin(storeFixture);
          function resetFixture() {
            if (config2.fixture == null) {
              return;
            }
            var fixture = document.getElementById("qunit-fixture");
            var resetFixtureType = _typeof(config2.fixture);
            if (resetFixtureType === "string") {
              var newFixture = document.createElement("div");
              newFixture.setAttribute("id", "qunit-fixture");
              newFixture.innerHTML = config2.fixture;
              fixture.parentNode.replaceChild(newFixture, fixture);
            } else {
              var clonedFixture = config2.fixture.cloneNode(true);
              fixture.parentNode.replaceChild(clonedFixture, fixture);
            }
          }
          QUnit.testStart(resetFixture);
        })();
        (function() {
          var location = typeof window$1 !== "undefined" && window$1.location;
          if (!location) {
            return;
          }
          var urlParams = getUrlParams();
          QUnit.urlParams = urlParams;
          QUnit.config.moduleId = [].concat(urlParams.moduleId || []);
          QUnit.config.testId = [].concat(urlParams.testId || []);
          QUnit.config.module = urlParams.module;
          QUnit.config.filter = urlParams.filter;
          if (urlParams.seed === true) {
            QUnit.config.seed = Math.random().toString(36).slice(2);
          } else if (urlParams.seed) {
            QUnit.config.seed = urlParams.seed;
          }
          QUnit.config.urlConfig.push({
            id: "hidepassed",
            label: "Hide passed tests",
            tooltip: "Only show tests and assertions that fail. Stored as query-strings."
          }, {
            id: "noglobals",
            label: "Check for Globals",
            tooltip: "Enabling this will test if any test introduces new properties on the global object (`window` in Browsers). Stored as query-strings."
          }, {
            id: "notrycatch",
            label: "No try-catch",
            tooltip: "Enabling this will run tests outside of a try-catch block. Makes debugging exceptions in IE reasonable. Stored as query-strings."
          });
          QUnit.begin(function() {
            var i, option, urlConfig = QUnit.config.urlConfig;
            for (i = 0; i < urlConfig.length; i++) {
              option = QUnit.config.urlConfig[i];
              if (typeof option !== "string") {
                option = option.id;
              }
              if (QUnit.config[option] === void 0) {
                QUnit.config[option] = urlParams[option];
              }
            }
          });
          function getUrlParams() {
            var i, param, name, value;
            var urlParams2 = Object.create(null);
            var params = location.search.slice(1).split("&");
            var length = params.length;
            for (i = 0; i < length; i++) {
              if (params[i]) {
                param = params[i].split("=");
                name = decodeQueryParam(param[0]);
                value = param.length === 1 || decodeQueryParam(param.slice(1).join("="));
                if (name in urlParams2) {
                  urlParams2[name] = [].concat(urlParams2[name], value);
                } else {
                  urlParams2[name] = value;
                }
              }
            }
            return urlParams2;
          }
          function decodeQueryParam(param) {
            return decodeURIComponent(param.replace(/\+/g, "%20"));
          }
        })();
        var fuzzysort$1 = { exports: {} };
        (function(module2) {
          (function(root, UMD) {
            if (module2.exports)
              module2.exports = UMD();
            else
              root.fuzzysort = UMD();
          })(commonjsGlobal, function UMD() {
            function fuzzysortNew(instanceOptions) {
              var fuzzysort2 = {
                single: function single(search, target, options) {
                  if (!search)
                    return null;
                  if (!isObj(search))
                    search = fuzzysort2.getPreparedSearch(search);
                  if (!target)
                    return null;
                  if (!isObj(target))
                    target = fuzzysort2.getPrepared(target);
                  var allowTypo = options && options.allowTypo !== void 0 ? options.allowTypo : instanceOptions && instanceOptions.allowTypo !== void 0 ? instanceOptions.allowTypo : true;
                  var algorithm = allowTypo ? fuzzysort2.algorithm : fuzzysort2.algorithmNoTypo;
                  return algorithm(search, target, search[0]);
                },
                go: function go(search, targets, options) {
                  if (!search)
                    return noResults;
                  search = fuzzysort2.prepareSearch(search);
                  var searchLowerCode = search[0];
                  var threshold = options && options.threshold || instanceOptions && instanceOptions.threshold || -9007199254740991;
                  var limit = options && options.limit || instanceOptions && instanceOptions.limit || 9007199254740991;
                  var allowTypo = options && options.allowTypo !== void 0 ? options.allowTypo : instanceOptions && instanceOptions.allowTypo !== void 0 ? instanceOptions.allowTypo : true;
                  var algorithm = allowTypo ? fuzzysort2.algorithm : fuzzysort2.algorithmNoTypo;
                  var resultsLen = 0;
                  var limitedCount = 0;
                  var targetsLen = targets.length;
                  if (options && options.keys) {
                    var scoreFn = options.scoreFn || defaultScoreFn;
                    var keys = options.keys;
                    var keysLen = keys.length;
                    for (var i = targetsLen - 1; i >= 0; --i) {
                      var obj = targets[i];
                      var objResults = new Array(keysLen);
                      for (var keyI = keysLen - 1; keyI >= 0; --keyI) {
                        var key = keys[keyI];
                        var target = getValue(obj, key);
                        if (!target) {
                          objResults[keyI] = null;
                          continue;
                        }
                        if (!isObj(target))
                          target = fuzzysort2.getPrepared(target);
                        objResults[keyI] = algorithm(search, target, searchLowerCode);
                      }
                      objResults.obj = obj;
                      var score = scoreFn(objResults);
                      if (score === null)
                        continue;
                      if (score < threshold)
                        continue;
                      objResults.score = score;
                      if (resultsLen < limit) {
                        q.add(objResults);
                        ++resultsLen;
                      } else {
                        ++limitedCount;
                        if (score > q.peek().score)
                          q.replaceTop(objResults);
                      }
                    }
                  } else if (options && options.key) {
                    var key = options.key;
                    for (var i = targetsLen - 1; i >= 0; --i) {
                      var obj = targets[i];
                      var target = getValue(obj, key);
                      if (!target)
                        continue;
                      if (!isObj(target))
                        target = fuzzysort2.getPrepared(target);
                      var result = algorithm(search, target, searchLowerCode);
                      if (result === null)
                        continue;
                      if (result.score < threshold)
                        continue;
                      result = {
                        target: result.target,
                        _targetLowerCodes: null,
                        _nextBeginningIndexes: null,
                        score: result.score,
                        indexes: result.indexes,
                        obj
                      };
                      if (resultsLen < limit) {
                        q.add(result);
                        ++resultsLen;
                      } else {
                        ++limitedCount;
                        if (result.score > q.peek().score)
                          q.replaceTop(result);
                      }
                    }
                  } else {
                    for (var i = targetsLen - 1; i >= 0; --i) {
                      var target = targets[i];
                      if (!target)
                        continue;
                      if (!isObj(target))
                        target = fuzzysort2.getPrepared(target);
                      var result = algorithm(search, target, searchLowerCode);
                      if (result === null)
                        continue;
                      if (result.score < threshold)
                        continue;
                      if (resultsLen < limit) {
                        q.add(result);
                        ++resultsLen;
                      } else {
                        ++limitedCount;
                        if (result.score > q.peek().score)
                          q.replaceTop(result);
                      }
                    }
                  }
                  if (resultsLen === 0)
                    return noResults;
                  var results = new Array(resultsLen);
                  for (var i = resultsLen - 1; i >= 0; --i) {
                    results[i] = q.poll();
                  }
                  results.total = resultsLen + limitedCount;
                  return results;
                },
                goAsync: function goAsync(search, targets, options) {
                  var canceled = false;
                  var p = new Promise(function(resolve, reject) {
                    if (!search)
                      return resolve(noResults);
                    search = fuzzysort2.prepareSearch(search);
                    var searchLowerCode = search[0];
                    var q2 = fastpriorityqueue();
                    var iCurrent = targets.length - 1;
                    var threshold = options && options.threshold || instanceOptions && instanceOptions.threshold || -9007199254740991;
                    var limit = options && options.limit || instanceOptions && instanceOptions.limit || 9007199254740991;
                    var allowTypo = options && options.allowTypo !== void 0 ? options.allowTypo : instanceOptions && instanceOptions.allowTypo !== void 0 ? instanceOptions.allowTypo : true;
                    var algorithm = allowTypo ? fuzzysort2.algorithm : fuzzysort2.algorithmNoTypo;
                    var resultsLen = 0;
                    var limitedCount = 0;
                    function step() {
                      if (canceled)
                        return reject("canceled");
                      var startMs = Date.now();
                      if (options && options.keys) {
                        var scoreFn = options.scoreFn || defaultScoreFn;
                        var keys = options.keys;
                        var keysLen = keys.length;
                        for (; iCurrent >= 0; --iCurrent) {
                          var obj = targets[iCurrent];
                          var objResults = new Array(keysLen);
                          for (var keyI = keysLen - 1; keyI >= 0; --keyI) {
                            var key = keys[keyI];
                            var target = getValue(obj, key);
                            if (!target) {
                              objResults[keyI] = null;
                              continue;
                            }
                            if (!isObj(target))
                              target = fuzzysort2.getPrepared(target);
                            objResults[keyI] = algorithm(search, target, searchLowerCode);
                          }
                          objResults.obj = obj;
                          var score = scoreFn(objResults);
                          if (score === null)
                            continue;
                          if (score < threshold)
                            continue;
                          objResults.score = score;
                          if (resultsLen < limit) {
                            q2.add(objResults);
                            ++resultsLen;
                          } else {
                            ++limitedCount;
                            if (score > q2.peek().score)
                              q2.replaceTop(objResults);
                          }
                          if (iCurrent % 1e3 === 0) {
                            if (Date.now() - startMs >= 10) {
                              isNode ? setImmediate(step) : setTimeout(step);
                              return;
                            }
                          }
                        }
                      } else if (options && options.key) {
                        var key = options.key;
                        for (; iCurrent >= 0; --iCurrent) {
                          var obj = targets[iCurrent];
                          var target = getValue(obj, key);
                          if (!target)
                            continue;
                          if (!isObj(target))
                            target = fuzzysort2.getPrepared(target);
                          var result = algorithm(search, target, searchLowerCode);
                          if (result === null)
                            continue;
                          if (result.score < threshold)
                            continue;
                          result = {
                            target: result.target,
                            _targetLowerCodes: null,
                            _nextBeginningIndexes: null,
                            score: result.score,
                            indexes: result.indexes,
                            obj
                          };
                          if (resultsLen < limit) {
                            q2.add(result);
                            ++resultsLen;
                          } else {
                            ++limitedCount;
                            if (result.score > q2.peek().score)
                              q2.replaceTop(result);
                          }
                          if (iCurrent % 1e3 === 0) {
                            if (Date.now() - startMs >= 10) {
                              isNode ? setImmediate(step) : setTimeout(step);
                              return;
                            }
                          }
                        }
                      } else {
                        for (; iCurrent >= 0; --iCurrent) {
                          var target = targets[iCurrent];
                          if (!target)
                            continue;
                          if (!isObj(target))
                            target = fuzzysort2.getPrepared(target);
                          var result = algorithm(search, target, searchLowerCode);
                          if (result === null)
                            continue;
                          if (result.score < threshold)
                            continue;
                          if (resultsLen < limit) {
                            q2.add(result);
                            ++resultsLen;
                          } else {
                            ++limitedCount;
                            if (result.score > q2.peek().score)
                              q2.replaceTop(result);
                          }
                          if (iCurrent % 1e3 === 0) {
                            if (Date.now() - startMs >= 10) {
                              isNode ? setImmediate(step) : setTimeout(step);
                              return;
                            }
                          }
                        }
                      }
                      if (resultsLen === 0)
                        return resolve(noResults);
                      var results = new Array(resultsLen);
                      for (var i = resultsLen - 1; i >= 0; --i) {
                        results[i] = q2.poll();
                      }
                      results.total = resultsLen + limitedCount;
                      resolve(results);
                    }
                    isNode ? setImmediate(step) : step();
                  });
                  p.cancel = function() {
                    canceled = true;
                  };
                  return p;
                },
                highlight: function highlight(result, hOpen, hClose) {
                  if (result === null)
                    return null;
                  if (hOpen === void 0)
                    hOpen = "<b>";
                  if (hClose === void 0)
                    hClose = "</b>";
                  var highlighted = "";
                  var matchesIndex = 0;
                  var opened = false;
                  var target = result.target;
                  var targetLen = target.length;
                  var matchesBest = result.indexes;
                  for (var i = 0; i < targetLen; ++i) {
                    var char = target[i];
                    if (matchesBest[matchesIndex] === i) {
                      ++matchesIndex;
                      if (!opened) {
                        opened = true;
                        highlighted += hOpen;
                      }
                      if (matchesIndex === matchesBest.length) {
                        highlighted += char + hClose + target.substr(i + 1);
                        break;
                      }
                    } else {
                      if (opened) {
                        opened = false;
                        highlighted += hClose;
                      }
                    }
                    highlighted += char;
                  }
                  return highlighted;
                },
                prepare: function prepare(target) {
                  if (!target)
                    return;
                  return {
                    target,
                    _targetLowerCodes: fuzzysort2.prepareLowerCodes(target),
                    _nextBeginningIndexes: null,
                    score: null,
                    indexes: null,
                    obj: null
                  };
                },
                prepareSlow: function prepareSlow(target) {
                  if (!target)
                    return;
                  return {
                    target,
                    _targetLowerCodes: fuzzysort2.prepareLowerCodes(target),
                    _nextBeginningIndexes: fuzzysort2.prepareNextBeginningIndexes(target),
                    score: null,
                    indexes: null,
                    obj: null
                  };
                },
                prepareSearch: function prepareSearch(search) {
                  if (!search)
                    return;
                  return fuzzysort2.prepareLowerCodes(search);
                },
                getPrepared: function getPrepared(target) {
                  if (target.length > 999)
                    return fuzzysort2.prepare(target);
                  var targetPrepared = preparedCache.get(target);
                  if (targetPrepared !== void 0)
                    return targetPrepared;
                  targetPrepared = fuzzysort2.prepare(target);
                  preparedCache.set(target, targetPrepared);
                  return targetPrepared;
                },
                getPreparedSearch: function getPreparedSearch(search) {
                  if (search.length > 999)
                    return fuzzysort2.prepareSearch(search);
                  var searchPrepared = preparedSearchCache.get(search);
                  if (searchPrepared !== void 0)
                    return searchPrepared;
                  searchPrepared = fuzzysort2.prepareSearch(search);
                  preparedSearchCache.set(search, searchPrepared);
                  return searchPrepared;
                },
                algorithm: function algorithm(searchLowerCodes, prepared, searchLowerCode) {
                  var targetLowerCodes = prepared._targetLowerCodes;
                  var searchLen = searchLowerCodes.length;
                  var targetLen = targetLowerCodes.length;
                  var searchI = 0;
                  var targetI = 0;
                  var typoSimpleI = 0;
                  var matchesSimpleLen = 0;
                  for (; ; ) {
                    var isMatch = searchLowerCode === targetLowerCodes[targetI];
                    if (isMatch) {
                      matchesSimple[matchesSimpleLen++] = targetI;
                      ++searchI;
                      if (searchI === searchLen)
                        break;
                      searchLowerCode = searchLowerCodes[typoSimpleI === 0 ? searchI : typoSimpleI === searchI ? searchI + 1 : typoSimpleI === searchI - 1 ? searchI - 1 : searchI];
                    }
                    ++targetI;
                    if (targetI >= targetLen) {
                      for (; ; ) {
                        if (searchI <= 1)
                          return null;
                        if (typoSimpleI === 0) {
                          --searchI;
                          var searchLowerCodeNew = searchLowerCodes[searchI];
                          if (searchLowerCode === searchLowerCodeNew)
                            continue;
                          typoSimpleI = searchI;
                        } else {
                          if (typoSimpleI === 1)
                            return null;
                          --typoSimpleI;
                          searchI = typoSimpleI;
                          searchLowerCode = searchLowerCodes[searchI + 1];
                          var searchLowerCodeNew = searchLowerCodes[searchI];
                          if (searchLowerCode === searchLowerCodeNew)
                            continue;
                        }
                        matchesSimpleLen = searchI;
                        targetI = matchesSimple[matchesSimpleLen - 1] + 1;
                        break;
                      }
                    }
                  }
                  var searchI = 0;
                  var typoStrictI = 0;
                  var successStrict = false;
                  var matchesStrictLen = 0;
                  var nextBeginningIndexes = prepared._nextBeginningIndexes;
                  if (nextBeginningIndexes === null)
                    nextBeginningIndexes = prepared._nextBeginningIndexes = fuzzysort2.prepareNextBeginningIndexes(prepared.target);
                  var firstPossibleI = targetI = matchesSimple[0] === 0 ? 0 : nextBeginningIndexes[matchesSimple[0] - 1];
                  if (targetI !== targetLen)
                    for (; ; ) {
                      if (targetI >= targetLen) {
                        if (searchI <= 0) {
                          ++typoStrictI;
                          if (typoStrictI > searchLen - 2)
                            break;
                          if (searchLowerCodes[typoStrictI] === searchLowerCodes[typoStrictI + 1])
                            continue;
                          targetI = firstPossibleI;
                          continue;
                        }
                        --searchI;
                        var lastMatch = matchesStrict[--matchesStrictLen];
                        targetI = nextBeginningIndexes[lastMatch];
                      } else {
                        var isMatch = searchLowerCodes[typoStrictI === 0 ? searchI : typoStrictI === searchI ? searchI + 1 : typoStrictI === searchI - 1 ? searchI - 1 : searchI] === targetLowerCodes[targetI];
                        if (isMatch) {
                          matchesStrict[matchesStrictLen++] = targetI;
                          ++searchI;
                          if (searchI === searchLen) {
                            successStrict = true;
                            break;
                          }
                          ++targetI;
                        } else {
                          targetI = nextBeginningIndexes[targetI];
                        }
                      }
                    }
                  {
                    if (successStrict) {
                      var matchesBest = matchesStrict;
                      var matchesBestLen = matchesStrictLen;
                    } else {
                      var matchesBest = matchesSimple;
                      var matchesBestLen = matchesSimpleLen;
                    }
                    var score = 0;
                    var lastTargetI = -1;
                    for (var i = 0; i < searchLen; ++i) {
                      var targetI = matchesBest[i];
                      if (lastTargetI !== targetI - 1)
                        score -= targetI;
                      lastTargetI = targetI;
                    }
                    if (!successStrict) {
                      score *= 1e3;
                      if (typoSimpleI !== 0)
                        score += -20;
                    } else {
                      if (typoStrictI !== 0)
                        score += -20;
                    }
                    score -= targetLen - searchLen;
                    prepared.score = score;
                    prepared.indexes = new Array(matchesBestLen);
                    for (var i = matchesBestLen - 1; i >= 0; --i) {
                      prepared.indexes[i] = matchesBest[i];
                    }
                    return prepared;
                  }
                },
                algorithmNoTypo: function algorithmNoTypo(searchLowerCodes, prepared, searchLowerCode) {
                  var targetLowerCodes = prepared._targetLowerCodes;
                  var searchLen = searchLowerCodes.length;
                  var targetLen = targetLowerCodes.length;
                  var searchI = 0;
                  var targetI = 0;
                  var matchesSimpleLen = 0;
                  for (; ; ) {
                    var isMatch = searchLowerCode === targetLowerCodes[targetI];
                    if (isMatch) {
                      matchesSimple[matchesSimpleLen++] = targetI;
                      ++searchI;
                      if (searchI === searchLen)
                        break;
                      searchLowerCode = searchLowerCodes[searchI];
                    }
                    ++targetI;
                    if (targetI >= targetLen)
                      return null;
                  }
                  var searchI = 0;
                  var successStrict = false;
                  var matchesStrictLen = 0;
                  var nextBeginningIndexes = prepared._nextBeginningIndexes;
                  if (nextBeginningIndexes === null)
                    nextBeginningIndexes = prepared._nextBeginningIndexes = fuzzysort2.prepareNextBeginningIndexes(prepared.target);
                  targetI = matchesSimple[0] === 0 ? 0 : nextBeginningIndexes[matchesSimple[0] - 1];
                  if (targetI !== targetLen)
                    for (; ; ) {
                      if (targetI >= targetLen) {
                        if (searchI <= 0)
                          break;
                        --searchI;
                        var lastMatch = matchesStrict[--matchesStrictLen];
                        targetI = nextBeginningIndexes[lastMatch];
                      } else {
                        var isMatch = searchLowerCodes[searchI] === targetLowerCodes[targetI];
                        if (isMatch) {
                          matchesStrict[matchesStrictLen++] = targetI;
                          ++searchI;
                          if (searchI === searchLen) {
                            successStrict = true;
                            break;
                          }
                          ++targetI;
                        } else {
                          targetI = nextBeginningIndexes[targetI];
                        }
                      }
                    }
                  {
                    if (successStrict) {
                      var matchesBest = matchesStrict;
                      var matchesBestLen = matchesStrictLen;
                    } else {
                      var matchesBest = matchesSimple;
                      var matchesBestLen = matchesSimpleLen;
                    }
                    var score = 0;
                    var lastTargetI = -1;
                    for (var i = 0; i < searchLen; ++i) {
                      var targetI = matchesBest[i];
                      if (lastTargetI !== targetI - 1)
                        score -= targetI;
                      lastTargetI = targetI;
                    }
                    if (!successStrict)
                      score *= 1e3;
                    score -= targetLen - searchLen;
                    prepared.score = score;
                    prepared.indexes = new Array(matchesBestLen);
                    for (var i = matchesBestLen - 1; i >= 0; --i) {
                      prepared.indexes[i] = matchesBest[i];
                    }
                    return prepared;
                  }
                },
                prepareLowerCodes: function prepareLowerCodes(str) {
                  var strLen = str.length;
                  var lowerCodes = [];
                  var lower = str.toLowerCase();
                  for (var i = 0; i < strLen; ++i) {
                    lowerCodes[i] = lower.charCodeAt(i);
                  }
                  return lowerCodes;
                },
                prepareBeginningIndexes: function prepareBeginningIndexes(target) {
                  var targetLen = target.length;
                  var beginningIndexes = [];
                  var beginningIndexesLen = 0;
                  var wasUpper = false;
                  var wasAlphanum = false;
                  for (var i = 0; i < targetLen; ++i) {
                    var targetCode = target.charCodeAt(i);
                    var isUpper = targetCode >= 65 && targetCode <= 90;
                    var isAlphanum = isUpper || targetCode >= 97 && targetCode <= 122 || targetCode >= 48 && targetCode <= 57;
                    var isBeginning = isUpper && !wasUpper || !wasAlphanum || !isAlphanum;
                    wasUpper = isUpper;
                    wasAlphanum = isAlphanum;
                    if (isBeginning)
                      beginningIndexes[beginningIndexesLen++] = i;
                  }
                  return beginningIndexes;
                },
                prepareNextBeginningIndexes: function prepareNextBeginningIndexes(target) {
                  var targetLen = target.length;
                  var beginningIndexes = fuzzysort2.prepareBeginningIndexes(target);
                  var nextBeginningIndexes = [];
                  var lastIsBeginning = beginningIndexes[0];
                  var lastIsBeginningI = 0;
                  for (var i = 0; i < targetLen; ++i) {
                    if (lastIsBeginning > i) {
                      nextBeginningIndexes[i] = lastIsBeginning;
                    } else {
                      lastIsBeginning = beginningIndexes[++lastIsBeginningI];
                      nextBeginningIndexes[i] = lastIsBeginning === void 0 ? targetLen : lastIsBeginning;
                    }
                  }
                  return nextBeginningIndexes;
                },
                cleanup,
                new: fuzzysortNew
              };
              return fuzzysort2;
            }
            var isNode = typeof commonjsRequire !== "undefined" && typeof window === "undefined";
            var preparedCache = new Map();
            var preparedSearchCache = new Map();
            var noResults = [];
            noResults.total = 0;
            var matchesSimple = [];
            var matchesStrict = [];
            function cleanup() {
              preparedCache.clear();
              preparedSearchCache.clear();
              matchesSimple = [];
              matchesStrict = [];
            }
            function defaultScoreFn(a) {
              var max = -9007199254740991;
              for (var i = a.length - 1; i >= 0; --i) {
                var result = a[i];
                if (result === null)
                  continue;
                var score = result.score;
                if (score > max)
                  max = score;
              }
              if (max === -9007199254740991)
                return null;
              return max;
            }
            function getValue(obj, prop) {
              var tmp = obj[prop];
              if (tmp !== void 0)
                return tmp;
              var segs = prop;
              if (!Array.isArray(prop))
                segs = prop.split(".");
              var len = segs.length;
              var i = -1;
              while (obj && ++i < len) {
                obj = obj[segs[i]];
              }
              return obj;
            }
            function isObj(x) {
              return _typeof(x) === "object";
            }
            var fastpriorityqueue = function fastpriorityqueue2() {
              var r = [], o = 0, e = {};
              function n() {
                for (var e2 = 0, n2 = r[e2], c = 1; c < o; ) {
                  var f = c + 1;
                  e2 = c, f < o && r[f].score < r[c].score && (e2 = f), r[e2 - 1 >> 1] = r[e2], c = 1 + (e2 << 1);
                }
                for (var a = e2 - 1 >> 1; e2 > 0 && n2.score < r[a].score; a = (e2 = a) - 1 >> 1) {
                  r[e2] = r[a];
                }
                r[e2] = n2;
              }
              return e.add = function(e2) {
                var n2 = o;
                r[o++] = e2;
                for (var c = n2 - 1 >> 1; n2 > 0 && e2.score < r[c].score; c = (n2 = c) - 1 >> 1) {
                  r[n2] = r[c];
                }
                r[n2] = e2;
              }, e.poll = function() {
                if (o !== 0) {
                  var e2 = r[0];
                  return r[0] = r[--o], n(), e2;
                }
              }, e.peek = function(e2) {
                if (o !== 0)
                  return r[0];
              }, e.replaceTop = function(o2) {
                r[0] = o2, n();
              }, e;
            };
            var q = fastpriorityqueue();
            return fuzzysortNew();
          });
        })(fuzzysort$1);
        var fuzzysort = fuzzysort$1.exports;
        var stats = {
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          todoTests: 0
        };
        function escapeText(s) {
          if (!s) {
            return "";
          }
          s = s + "";
          return s.replace(/['"<>&]/g, function(s2) {
            switch (s2) {
              case "'":
                return "&#039;";
              case '"':
                return "&quot;";
              case "<":
                return "&lt;";
              case ">":
                return "&gt;";
              case "&":
                return "&amp;";
            }
          });
        }
        (function() {
          if (!window$1 || !document) {
            return;
          }
          var config2 = QUnit.config, hiddenTests = [], collapseNext = false, hasOwn2 = Object.prototype.hasOwnProperty, unfilteredUrl = setUrl({
            filter: void 0,
            module: void 0,
            moduleId: void 0,
            testId: void 0
          });
          function trim(string) {
            if (typeof string.trim === "function") {
              return string.trim();
            } else {
              return string.replace(/^\s+|\s+$/g, "");
            }
          }
          function addEvent(elem, type, fn) {
            elem.addEventListener(type, fn, false);
          }
          function removeEvent(elem, type, fn) {
            elem.removeEventListener(type, fn, false);
          }
          function addEvents(elems, type, fn) {
            var i = elems.length;
            while (i--) {
              addEvent(elems[i], type, fn);
            }
          }
          function hasClass(elem, name) {
            return (" " + elem.className + " ").indexOf(" " + name + " ") >= 0;
          }
          function addClass(elem, name) {
            if (!hasClass(elem, name)) {
              elem.className += (elem.className ? " " : "") + name;
            }
          }
          function toggleClass(elem, name, force) {
            if (force || typeof force === "undefined" && !hasClass(elem, name)) {
              addClass(elem, name);
            } else {
              removeClass(elem, name);
            }
          }
          function removeClass(elem, name) {
            var set = " " + elem.className + " ";
            while (set.indexOf(" " + name + " ") >= 0) {
              set = set.replace(" " + name + " ", " ");
            }
            elem.className = trim(set);
          }
          function id(name) {
            return document.getElementById && document.getElementById(name);
          }
          function abortTests() {
            var abortButton = id("qunit-abort-tests-button");
            if (abortButton) {
              abortButton.disabled = true;
              abortButton.innerHTML = "Aborting...";
            }
            QUnit.config.queue.length = 0;
            return false;
          }
          function interceptNavigation(ev) {
            var filterInputElem = id("qunit-filter-input");
            filterInputElem.value = trim(filterInputElem.value);
            applyUrlParams();
            if (ev && ev.preventDefault) {
              ev.preventDefault();
            }
            return false;
          }
          function getUrlConfigHtml() {
            var i, j, val, escaped, escapedTooltip, selection = false, urlConfig = config2.urlConfig, urlConfigHtml = "";
            for (i = 0; i < urlConfig.length; i++) {
              val = config2.urlConfig[i];
              if (typeof val === "string") {
                val = {
                  id: val,
                  label: val
                };
              }
              escaped = escapeText(val.id);
              escapedTooltip = escapeText(val.tooltip);
              if (!val.value || typeof val.value === "string") {
                urlConfigHtml += "<label for='qunit-urlconfig-" + escaped + "' title='" + escapedTooltip + "'><input id='qunit-urlconfig-" + escaped + "' name='" + escaped + "' type='checkbox'" + (val.value ? " value='" + escapeText(val.value) + "'" : "") + (config2[val.id] ? " checked='checked'" : "") + " title='" + escapedTooltip + "' />" + escapeText(val.label) + "</label>";
              } else {
                urlConfigHtml += "<label for='qunit-urlconfig-" + escaped + "' title='" + escapedTooltip + "'>" + val.label + ": </label><select id='qunit-urlconfig-" + escaped + "' name='" + escaped + "' title='" + escapedTooltip + "'><option></option>";
                if (QUnit.is("array", val.value)) {
                  for (j = 0; j < val.value.length; j++) {
                    escaped = escapeText(val.value[j]);
                    urlConfigHtml += "<option value='" + escaped + "'" + (config2[val.id] === val.value[j] ? (selection = true) && " selected='selected'" : "") + ">" + escaped + "</option>";
                  }
                } else {
                  for (j in val.value) {
                    if (hasOwn2.call(val.value, j)) {
                      urlConfigHtml += "<option value='" + escapeText(j) + "'" + (config2[val.id] === j ? (selection = true) && " selected='selected'" : "") + ">" + escapeText(val.value[j]) + "</option>";
                    }
                  }
                }
                if (config2[val.id] && !selection) {
                  escaped = escapeText(config2[val.id]);
                  urlConfigHtml += "<option value='" + escaped + "' selected='selected' disabled='disabled'>" + escaped + "</option>";
                }
                urlConfigHtml += "</select>";
              }
            }
            return urlConfigHtml;
          }
          function toolbarChanged() {
            var updatedUrl, value, tests, field = this, params = {};
            if ("selectedIndex" in field) {
              value = field.options[field.selectedIndex].value || void 0;
            } else {
              value = field.checked ? field.defaultValue || true : void 0;
            }
            params[field.name] = value;
            updatedUrl = setUrl(params);
            if (field.name === "hidepassed" && "replaceState" in window$1.history) {
              QUnit.urlParams[field.name] = value;
              config2[field.name] = value || false;
              tests = id("qunit-tests");
              if (tests) {
                var length = tests.children.length;
                var children = tests.children;
                if (field.checked) {
                  for (var i = 0; i < length; i++) {
                    var test2 = children[i];
                    var className = test2 ? test2.className : "";
                    var classNameHasPass = className.indexOf("pass") > -1;
                    var classNameHasSkipped = className.indexOf("skipped") > -1;
                    if (classNameHasPass || classNameHasSkipped) {
                      hiddenTests.push(test2);
                    }
                  }
                  var _iterator = _createForOfIteratorHelper(hiddenTests), _step;
                  try {
                    for (_iterator.s(); !(_step = _iterator.n()).done; ) {
                      var hiddenTest = _step.value;
                      tests.removeChild(hiddenTest);
                    }
                  } catch (err) {
                    _iterator.e(err);
                  } finally {
                    _iterator.f();
                  }
                } else {
                  while ((test2 = hiddenTests.pop()) != null) {
                    tests.appendChild(test2);
                  }
                }
              }
              window$1.history.replaceState(null, "", updatedUrl);
            } else {
              window$1.location = updatedUrl;
            }
          }
          function setUrl(params) {
            var key, arrValue, i, querystring = "?", location = window$1.location;
            params = extend(extend({}, QUnit.urlParams), params);
            for (key in params) {
              if (hasOwn2.call(params, key) && params[key] !== void 0) {
                arrValue = [].concat(params[key]);
                for (i = 0; i < arrValue.length; i++) {
                  querystring += encodeURIComponent(key);
                  if (arrValue[i] !== true) {
                    querystring += "=" + encodeURIComponent(arrValue[i]);
                  }
                  querystring += "&";
                }
              }
            }
            return location.protocol + "//" + location.host + location.pathname + querystring.slice(0, -1);
          }
          function applyUrlParams() {
            var i, selectedModules = [], modulesList = id("qunit-modulefilter-dropdown-list").getElementsByTagName("input"), filter = id("qunit-filter-input").value;
            for (i = 0; i < modulesList.length; i++) {
              if (modulesList[i].checked) {
                selectedModules.push(modulesList[i].value);
              }
            }
            window$1.location = setUrl({
              filter: filter === "" ? void 0 : filter,
              moduleId: selectedModules.length === 0 ? void 0 : selectedModules,
              module: void 0,
              testId: void 0
            });
          }
          function toolbarUrlConfigContainer() {
            var urlConfigContainer = document.createElement("span");
            urlConfigContainer.innerHTML = getUrlConfigHtml();
            addClass(urlConfigContainer, "qunit-url-config");
            addEvents(urlConfigContainer.getElementsByTagName("input"), "change", toolbarChanged);
            addEvents(urlConfigContainer.getElementsByTagName("select"), "change", toolbarChanged);
            return urlConfigContainer;
          }
          function abortTestsButton() {
            var button = document.createElement("button");
            button.id = "qunit-abort-tests-button";
            button.innerHTML = "Abort";
            addEvent(button, "click", abortTests);
            return button;
          }
          function toolbarLooseFilter() {
            var filter = document.createElement("form"), label = document.createElement("label"), input = document.createElement("input"), button = document.createElement("button");
            addClass(filter, "qunit-filter");
            label.innerHTML = "Filter: ";
            input.type = "text";
            input.value = config2.filter || "";
            input.name = "filter";
            input.id = "qunit-filter-input";
            button.innerHTML = "Go";
            label.appendChild(input);
            filter.appendChild(label);
            filter.appendChild(document.createTextNode(" "));
            filter.appendChild(button);
            addEvent(filter, "submit", interceptNavigation);
            return filter;
          }
          function moduleListHtml(modules) {
            var i, checked, html = "";
            for (i = 0; i < modules.length; i++) {
              if (modules[i].name !== "") {
                checked = config2.moduleId.indexOf(modules[i].moduleId) > -1;
                html += "<li><label class='clickable" + (checked ? " checked" : "") + "'><input type='checkbox' value='" + modules[i].moduleId + "'" + (checked ? " checked='checked'" : "") + " />" + escapeText(modules[i].name) + "</label></li>";
              }
            }
            return html;
          }
          function toolbarModuleFilter() {
            var commit, reset, moduleFilter = document.createElement("form"), label = document.createElement("label"), moduleSearch = document.createElement("input"), dropDown = document.createElement("div"), actions = document.createElement("span"), applyButton = document.createElement("button"), resetButton = document.createElement("button"), allModulesLabel = document.createElement("label"), allCheckbox = document.createElement("input"), dropDownList = document.createElement("ul"), dirty = false;
            moduleSearch.id = "qunit-modulefilter-search";
            moduleSearch.autocomplete = "off";
            addEvent(moduleSearch, "input", searchInput);
            addEvent(moduleSearch, "input", searchFocus);
            addEvent(moduleSearch, "focus", searchFocus);
            addEvent(moduleSearch, "click", searchFocus);
            config2.modules.forEach(function(module2) {
              return module2.namePrepared = fuzzysort.prepare(module2.name);
            });
            label.id = "qunit-modulefilter-search-container";
            label.innerHTML = "Module: ";
            label.appendChild(moduleSearch);
            applyButton.textContent = "Apply";
            applyButton.style.display = "none";
            resetButton.textContent = "Reset";
            resetButton.type = "reset";
            resetButton.style.display = "none";
            allCheckbox.type = "checkbox";
            allCheckbox.checked = config2.moduleId.length === 0;
            allModulesLabel.className = "clickable";
            if (config2.moduleId.length) {
              allModulesLabel.className = "checked";
            }
            allModulesLabel.appendChild(allCheckbox);
            allModulesLabel.appendChild(document.createTextNode("All modules"));
            actions.id = "qunit-modulefilter-actions";
            actions.appendChild(applyButton);
            actions.appendChild(resetButton);
            actions.appendChild(allModulesLabel);
            commit = actions.firstChild;
            reset = commit.nextSibling;
            addEvent(commit, "click", applyUrlParams);
            dropDownList.id = "qunit-modulefilter-dropdown-list";
            dropDownList.innerHTML = moduleListHtml(config2.modules);
            dropDown.id = "qunit-modulefilter-dropdown";
            dropDown.style.display = "none";
            dropDown.appendChild(actions);
            dropDown.appendChild(dropDownList);
            addEvent(dropDown, "change", selectionChange);
            selectionChange();
            moduleFilter.id = "qunit-modulefilter";
            moduleFilter.appendChild(label);
            moduleFilter.appendChild(dropDown);
            addEvent(moduleFilter, "submit", interceptNavigation);
            addEvent(moduleFilter, "reset", function() {
              window$1.setTimeout(selectionChange);
            });
            function searchFocus() {
              if (dropDown.style.display !== "none") {
                return;
              }
              dropDown.style.display = "block";
              addEvent(document, "click", hideHandler);
              addEvent(document, "keydown", hideHandler);
              function hideHandler(e) {
                var inContainer = moduleFilter.contains(e.target);
                if (e.keyCode === 27 || !inContainer) {
                  if (e.keyCode === 27 && inContainer) {
                    moduleSearch.focus();
                  }
                  dropDown.style.display = "none";
                  removeEvent(document, "click", hideHandler);
                  removeEvent(document, "keydown", hideHandler);
                  moduleSearch.value = "";
                  searchInput();
                }
              }
            }
            function filterModules(searchText) {
              if (searchText === "") {
                return config2.modules;
              }
              return fuzzysort.go(searchText, config2.modules, {
                key: "namePrepared",
                threshold: -1e4
              }).map(function(module2) {
                return module2.obj;
              });
            }
            var searchInputTimeout;
            function searchInput() {
              window$1.clearTimeout(searchInputTimeout);
              searchInputTimeout = window$1.setTimeout(function() {
                var searchText = moduleSearch.value.toLowerCase(), filteredModules = filterModules(searchText);
                dropDownList.innerHTML = moduleListHtml(filteredModules);
              }, 200);
            }
            function selectionChange(evt) {
              var i, item, checkbox = evt && evt.target || allCheckbox, modulesList = dropDownList.getElementsByTagName("input"), selectedNames = [];
              toggleClass(checkbox.parentNode, "checked", checkbox.checked);
              dirty = false;
              if (checkbox.checked && checkbox !== allCheckbox) {
                allCheckbox.checked = false;
                removeClass(allCheckbox.parentNode, "checked");
              }
              for (i = 0; i < modulesList.length; i++) {
                item = modulesList[i];
                if (!evt) {
                  toggleClass(item.parentNode, "checked", item.checked);
                } else if (checkbox === allCheckbox && checkbox.checked) {
                  item.checked = false;
                  removeClass(item.parentNode, "checked");
                }
                dirty = dirty || item.checked !== item.defaultChecked;
                if (item.checked) {
                  selectedNames.push(item.parentNode.textContent);
                }
              }
              commit.style.display = reset.style.display = dirty ? "" : "none";
              moduleSearch.placeholder = selectedNames.join(", ") || allCheckbox.parentNode.textContent;
              moduleSearch.title = "Type to filter list. Current selection:\n" + (selectedNames.join("\n") || allCheckbox.parentNode.textContent);
            }
            return moduleFilter;
          }
          function toolbarFilters() {
            var toolbarFilters2 = document.createElement("span");
            toolbarFilters2.id = "qunit-toolbar-filters";
            toolbarFilters2.appendChild(toolbarLooseFilter());
            toolbarFilters2.appendChild(toolbarModuleFilter());
            return toolbarFilters2;
          }
          function appendToolbar() {
            var toolbar = id("qunit-testrunner-toolbar");
            if (toolbar) {
              toolbar.appendChild(toolbarUrlConfigContainer());
              toolbar.appendChild(toolbarFilters());
              toolbar.appendChild(document.createElement("div")).className = "clearfix";
            }
          }
          function appendHeader() {
            var header = id("qunit-header");
            if (header) {
              header.innerHTML = "<a href='" + escapeText(unfilteredUrl) + "'>" + header.innerHTML + "</a> ";
            }
          }
          function appendBanner() {
            var banner = id("qunit-banner");
            if (banner) {
              banner.className = "";
            }
          }
          function appendTestResults() {
            var tests = id("qunit-tests"), result = id("qunit-testresult"), controls;
            if (result) {
              result.parentNode.removeChild(result);
            }
            if (tests) {
              tests.innerHTML = "";
              result = document.createElement("p");
              result.id = "qunit-testresult";
              result.className = "result";
              tests.parentNode.insertBefore(result, tests);
              result.innerHTML = '<div id="qunit-testresult-display">Running...<br />&#160;</div><div id="qunit-testresult-controls"></div><div class="clearfix"></div>';
              controls = id("qunit-testresult-controls");
            }
            if (controls) {
              controls.appendChild(abortTestsButton());
            }
          }
          function appendFilteredTest() {
            var testId = QUnit.config.testId;
            if (!testId || testId.length <= 0) {
              return "";
            }
            return "<div id='qunit-filteredTest'>Rerunning selected tests: " + escapeText(testId.join(", ")) + " <a id='qunit-clearFilter' href='" + escapeText(unfilteredUrl) + "'>Run all tests</a></div>";
          }
          function appendUserAgent() {
            var userAgent = id("qunit-userAgent");
            if (userAgent) {
              userAgent.innerHTML = "";
              userAgent.appendChild(document.createTextNode("QUnit " + QUnit.version + "; " + navigator.userAgent));
            }
          }
          function appendInterface() {
            var qunit = id("qunit");
            if (qunit) {
              qunit.setAttribute("role", "main");
              qunit.innerHTML = "<h1 id='qunit-header'>" + escapeText(document.title) + "</h1><h2 id='qunit-banner'></h2><div id='qunit-testrunner-toolbar' role='navigation'></div>" + appendFilteredTest() + "<h2 id='qunit-userAgent'></h2><ol id='qunit-tests'></ol>";
            }
            appendHeader();
            appendBanner();
            appendTestResults();
            appendUserAgent();
            appendToolbar();
          }
          function appendTest(name, testId, moduleName) {
            var title, rerunTrigger, testBlock, assertList, tests = id("qunit-tests");
            if (!tests) {
              return;
            }
            title = document.createElement("strong");
            title.innerHTML = getNameHtml(name, moduleName);
            rerunTrigger = document.createElement("a");
            rerunTrigger.innerHTML = "Rerun";
            rerunTrigger.href = setUrl({
              testId
            });
            testBlock = document.createElement("li");
            testBlock.appendChild(title);
            testBlock.appendChild(rerunTrigger);
            testBlock.id = "qunit-test-output-" + testId;
            assertList = document.createElement("ol");
            assertList.className = "qunit-assert-list";
            testBlock.appendChild(assertList);
            tests.appendChild(testBlock);
          }
          QUnit.begin(function() {
            appendInterface();
          });
          QUnit.done(function(details) {
            var banner = id("qunit-banner"), tests = id("qunit-tests"), abortButton = id("qunit-abort-tests-button"), totalTests = stats.passedTests + stats.skippedTests + stats.todoTests + stats.failedTests, html = [totalTests, " tests completed in ", details.runtime, " milliseconds, with ", stats.failedTests, " failed, ", stats.skippedTests, " skipped, and ", stats.todoTests, " todo.<br />", "<span class='passed'>", details.passed, "</span> assertions of <span class='total'>", details.total, "</span> passed, <span class='failed'>", details.failed, "</span> failed."].join(""), test2, assertLi, assertList;
            if (abortButton && abortButton.disabled) {
              html = "Tests aborted after " + details.runtime + " milliseconds.";
              for (var i = 0; i < tests.children.length; i++) {
                test2 = tests.children[i];
                if (test2.className === "" || test2.className === "running") {
                  test2.className = "aborted";
                  assertList = test2.getElementsByTagName("ol")[0];
                  assertLi = document.createElement("li");
                  assertLi.className = "fail";
                  assertLi.innerHTML = "Test aborted.";
                  assertList.appendChild(assertLi);
                }
              }
            }
            if (banner && (!abortButton || abortButton.disabled === false)) {
              banner.className = stats.failedTests ? "qunit-fail" : "qunit-pass";
            }
            if (abortButton) {
              abortButton.parentNode.removeChild(abortButton);
            }
            if (tests) {
              id("qunit-testresult-display").innerHTML = html;
            }
            if (config2.altertitle && document.title) {
              document.title = [stats.failedTests ? "\u2716" : "\u2714", document.title.replace(/^[\u2714\u2716] /i, "")].join(" ");
            }
            if (config2.scrolltop && window$1.scrollTo) {
              window$1.scrollTo(0, 0);
            }
          });
          function getNameHtml(name, module2) {
            var nameHtml = "";
            if (module2) {
              nameHtml = "<span class='module-name'>" + escapeText(module2) + "</span>: ";
            }
            nameHtml += "<span class='test-name'>" + escapeText(name) + "</span>";
            return nameHtml;
          }
          function getProgressHtml(runtime, stats2, total) {
            var completed = stats2.passedTests + stats2.skippedTests + stats2.todoTests + stats2.failedTests;
            return ["<br />", completed, " / ", total, " tests completed in ", runtime, " milliseconds, with ", stats2.failedTests, " failed, ", stats2.skippedTests, " skipped, and ", stats2.todoTests, " todo."].join("");
          }
          QUnit.testStart(function(details) {
            var running, bad;
            appendTest(details.name, details.testId, details.module);
            running = id("qunit-testresult-display");
            if (running) {
              addClass(running, "running");
              bad = QUnit.config.reorder && details.previousFailure;
              running.innerHTML = [bad ? "Rerunning previously failed test: <br />" : "Running: <br />", getNameHtml(details.name, details.module), getProgressHtml(now() - config2.started, stats, Test.count)].join("");
            }
          });
          function stripHtml(string) {
            return string.replace(/<\/?[^>]+(>|$)/g, "").replace(/&quot;/g, "").replace(/\s+/g, "");
          }
          QUnit.log(function(details) {
            var assertList, assertLi, message, expected, actual, diff2, showDiff = false, testItem = id("qunit-test-output-" + details.testId);
            if (!testItem) {
              return;
            }
            message = escapeText(details.message) || (details.result ? "okay" : "failed");
            message = "<span class='test-message'>" + message + "</span>";
            message += "<span class='runtime'>@ " + details.runtime + " ms</span>";
            if (!details.result && hasOwn2.call(details, "expected")) {
              if (details.negative) {
                expected = "NOT " + QUnit.dump.parse(details.expected);
              } else {
                expected = QUnit.dump.parse(details.expected);
              }
              actual = QUnit.dump.parse(details.actual);
              message += "<table><tr class='test-expected'><th>Expected: </th><td><pre>" + escapeText(expected) + "</pre></td></tr>";
              if (actual !== expected) {
                message += "<tr class='test-actual'><th>Result: </th><td><pre>" + escapeText(actual) + "</pre></td></tr>";
                if (typeof details.actual === "number" && typeof details.expected === "number") {
                  if (!isNaN(details.actual) && !isNaN(details.expected)) {
                    showDiff = true;
                    diff2 = details.actual - details.expected;
                    diff2 = (diff2 > 0 ? "+" : "") + diff2;
                  }
                } else if (typeof details.actual !== "boolean" && typeof details.expected !== "boolean") {
                  diff2 = QUnit.diff(expected, actual);
                  showDiff = stripHtml(diff2).length !== stripHtml(expected).length + stripHtml(actual).length;
                }
                if (showDiff) {
                  message += "<tr class='test-diff'><th>Diff: </th><td><pre>" + diff2 + "</pre></td></tr>";
                }
              } else if (expected.indexOf("[object Array]") !== -1 || expected.indexOf("[object Object]") !== -1) {
                message += "<tr class='test-message'><th>Message: </th><td>Diff suppressed as the depth of object is more than current max depth (" + QUnit.config.maxDepth + ").<p>Hint: Use <code>QUnit.dump.maxDepth</code> to  run with a higher max depth or <a href='" + escapeText(setUrl({
                  maxDepth: -1
                })) + "'>Rerun</a> without max depth.</p></td></tr>";
              } else {
                message += "<tr class='test-message'><th>Message: </th><td>Diff suppressed as the expected and actual results have an equivalent serialization</td></tr>";
              }
              if (details.source) {
                message += "<tr class='test-source'><th>Source: </th><td><pre>" + escapeText(details.source) + "</pre></td></tr>";
              }
              message += "</table>";
            } else if (!details.result && details.source) {
              message += "<table><tr class='test-source'><th>Source: </th><td><pre>" + escapeText(details.source) + "</pre></td></tr></table>";
            }
            assertList = testItem.getElementsByTagName("ol")[0];
            assertLi = document.createElement("li");
            assertLi.className = details.result ? "pass" : "fail";
            assertLi.innerHTML = message;
            assertList.appendChild(assertLi);
          });
          QUnit.testDone(function(details) {
            var testTitle, time, assertList, status, good, bad, testCounts, skipped, sourceName, tests = id("qunit-tests"), testItem = id("qunit-test-output-" + details.testId);
            if (!tests || !testItem) {
              return;
            }
            removeClass(testItem, "running");
            if (details.failed > 0) {
              status = "failed";
            } else if (details.todo) {
              status = "todo";
            } else {
              status = details.skipped ? "skipped" : "passed";
            }
            assertList = testItem.getElementsByTagName("ol")[0];
            good = details.passed;
            bad = details.failed;
            var testPassed = details.failed > 0 ? details.todo : !details.todo;
            if (testPassed) {
              addClass(assertList, "qunit-collapsed");
            } else if (config2.collapse) {
              if (!collapseNext) {
                collapseNext = true;
              } else {
                addClass(assertList, "qunit-collapsed");
              }
            }
            testTitle = testItem.firstChild;
            testCounts = bad ? "<b class='failed'>" + bad + "</b>, <b class='passed'>" + good + "</b>, " : "";
            testTitle.innerHTML += " <b class='counts'>(" + testCounts + details.assertions.length + ")</b>";
            if (details.skipped) {
              stats.skippedTests++;
              testItem.className = "skipped";
              skipped = document.createElement("em");
              skipped.className = "qunit-skipped-label";
              skipped.innerHTML = "skipped";
              testItem.insertBefore(skipped, testTitle);
            } else {
              addEvent(testTitle, "click", function() {
                toggleClass(assertList, "qunit-collapsed");
              });
              testItem.className = testPassed ? "pass" : "fail";
              if (details.todo) {
                var todoLabel = document.createElement("em");
                todoLabel.className = "qunit-todo-label";
                todoLabel.innerHTML = "todo";
                testItem.className += " todo";
                testItem.insertBefore(todoLabel, testTitle);
              }
              time = document.createElement("span");
              time.className = "runtime";
              time.innerHTML = details.runtime + " ms";
              testItem.insertBefore(time, assertList);
              if (!testPassed) {
                stats.failedTests++;
              } else if (details.todo) {
                stats.todoTests++;
              } else {
                stats.passedTests++;
              }
            }
            if (details.source) {
              sourceName = document.createElement("p");
              sourceName.innerHTML = "<strong>Source: </strong>" + escapeText(details.source);
              addClass(sourceName, "qunit-source");
              if (testPassed) {
                addClass(sourceName, "qunit-collapsed");
              }
              addEvent(testTitle, "click", function() {
                toggleClass(sourceName, "qunit-collapsed");
              });
              testItem.appendChild(sourceName);
            }
            if (config2.hidepassed && (status === "passed" || details.skipped)) {
              hiddenTests.push(testItem);
              tests.removeChild(testItem);
            }
          });
          var usingPhantom = function(p) {
            return p && p.version && p.version.major > 0;
          }(window$1.phantom);
          if (usingPhantom) {
            console$1.warn("Support for PhantomJS is deprecated and will be removed in QUnit 3.0.");
          }
          if (!usingPhantom && document.readyState === "complete") {
            QUnit.load();
          } else {
            addEvent(window$1, "load", QUnit.load);
          }
          var originalWindowOnError = window$1.onerror;
          window$1.onerror = function(message, fileName2, lineNumber, columnNumber, errorObj) {
            var ret = false;
            if (originalWindowOnError) {
              for (var _len = arguments.length, args = new Array(_len > 5 ? _len - 5 : 0), _key = 5; _key < _len; _key++) {
                args[_key - 5] = arguments[_key];
              }
              ret = originalWindowOnError.call.apply(originalWindowOnError, [this, message, fileName2, lineNumber, columnNumber, errorObj].concat(args));
            }
            if (ret !== true) {
              var error = {
                message,
                fileName: fileName2,
                lineNumber
              };
              if (errorObj && errorObj.stack) {
                error.stacktrace = extractStacktrace(errorObj, 0);
              }
              ret = QUnit.onError(error);
            }
            return ret;
          };
          window$1.addEventListener("unhandledrejection", function(event) {
            QUnit.onUnhandledRejection(event.reason);
          });
        })();
        QUnit.diff = function() {
          function DiffMatchPatch() {
          }
          var DIFF_DELETE = -1, DIFF_INSERT = 1, DIFF_EQUAL = 0, hasOwn2 = Object.prototype.hasOwnProperty;
          DiffMatchPatch.prototype.DiffMain = function(text1, text2, optChecklines) {
            var deadline, checklines, commonlength, commonprefix, commonsuffix, diffs;
            deadline = new Date().getTime() + 1e3;
            if (text1 === null || text2 === null) {
              throw new Error("Null input. (DiffMain)");
            }
            if (text1 === text2) {
              if (text1) {
                return [[DIFF_EQUAL, text1]];
              }
              return [];
            }
            if (typeof optChecklines === "undefined") {
              optChecklines = true;
            }
            checklines = optChecklines;
            commonlength = this.diffCommonPrefix(text1, text2);
            commonprefix = text1.substring(0, commonlength);
            text1 = text1.substring(commonlength);
            text2 = text2.substring(commonlength);
            commonlength = this.diffCommonSuffix(text1, text2);
            commonsuffix = text1.substring(text1.length - commonlength);
            text1 = text1.substring(0, text1.length - commonlength);
            text2 = text2.substring(0, text2.length - commonlength);
            diffs = this.diffCompute(text1, text2, checklines, deadline);
            if (commonprefix) {
              diffs.unshift([DIFF_EQUAL, commonprefix]);
            }
            if (commonsuffix) {
              diffs.push([DIFF_EQUAL, commonsuffix]);
            }
            this.diffCleanupMerge(diffs);
            return diffs;
          };
          DiffMatchPatch.prototype.diffCleanupEfficiency = function(diffs) {
            var changes, equalities, equalitiesLength, lastequality, pointer, preIns, preDel, postIns, postDel;
            changes = false;
            equalities = [];
            equalitiesLength = 0;
            lastequality = null;
            pointer = 0;
            preIns = false;
            preDel = false;
            postIns = false;
            postDel = false;
            while (pointer < diffs.length) {
              if (diffs[pointer][0] === DIFF_EQUAL) {
                if (diffs[pointer][1].length < 4 && (postIns || postDel)) {
                  equalities[equalitiesLength++] = pointer;
                  preIns = postIns;
                  preDel = postDel;
                  lastequality = diffs[pointer][1];
                } else {
                  equalitiesLength = 0;
                  lastequality = null;
                }
                postIns = postDel = false;
              } else {
                if (diffs[pointer][0] === DIFF_DELETE) {
                  postDel = true;
                } else {
                  postIns = true;
                }
                if (lastequality && (preIns && preDel && postIns && postDel || lastequality.length < 2 && preIns + preDel + postIns + postDel === 3)) {
                  diffs.splice(equalities[equalitiesLength - 1], 0, [DIFF_DELETE, lastequality]);
                  diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
                  equalitiesLength--;
                  lastequality = null;
                  if (preIns && preDel) {
                    postIns = postDel = true;
                    equalitiesLength = 0;
                  } else {
                    equalitiesLength--;
                    pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
                    postIns = postDel = false;
                  }
                  changes = true;
                }
              }
              pointer++;
            }
            if (changes) {
              this.diffCleanupMerge(diffs);
            }
          };
          DiffMatchPatch.prototype.diffPrettyHtml = function(diffs) {
            var op, data, x, html = [];
            for (x = 0; x < diffs.length; x++) {
              op = diffs[x][0];
              data = diffs[x][1];
              switch (op) {
                case DIFF_INSERT:
                  html[x] = "<ins>" + escapeText(data) + "</ins>";
                  break;
                case DIFF_DELETE:
                  html[x] = "<del>" + escapeText(data) + "</del>";
                  break;
                case DIFF_EQUAL:
                  html[x] = "<span>" + escapeText(data) + "</span>";
                  break;
              }
            }
            return html.join("");
          };
          DiffMatchPatch.prototype.diffCommonPrefix = function(text1, text2) {
            var pointermid, pointermax, pointermin, pointerstart;
            if (!text1 || !text2 || text1.charAt(0) !== text2.charAt(0)) {
              return 0;
            }
            pointermin = 0;
            pointermax = Math.min(text1.length, text2.length);
            pointermid = pointermax;
            pointerstart = 0;
            while (pointermin < pointermid) {
              if (text1.substring(pointerstart, pointermid) === text2.substring(pointerstart, pointermid)) {
                pointermin = pointermid;
                pointerstart = pointermin;
              } else {
                pointermax = pointermid;
              }
              pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
            }
            return pointermid;
          };
          DiffMatchPatch.prototype.diffCommonSuffix = function(text1, text2) {
            var pointermid, pointermax, pointermin, pointerend;
            if (!text1 || !text2 || text1.charAt(text1.length - 1) !== text2.charAt(text2.length - 1)) {
              return 0;
            }
            pointermin = 0;
            pointermax = Math.min(text1.length, text2.length);
            pointermid = pointermax;
            pointerend = 0;
            while (pointermin < pointermid) {
              if (text1.substring(text1.length - pointermid, text1.length - pointerend) === text2.substring(text2.length - pointermid, text2.length - pointerend)) {
                pointermin = pointermid;
                pointerend = pointermin;
              } else {
                pointermax = pointermid;
              }
              pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
            }
            return pointermid;
          };
          DiffMatchPatch.prototype.diffCompute = function(text1, text2, checklines, deadline) {
            var diffs, longtext, shorttext, i, hm, text1A, text2A, text1B, text2B, midCommon, diffsA, diffsB;
            if (!text1) {
              return [[DIFF_INSERT, text2]];
            }
            if (!text2) {
              return [[DIFF_DELETE, text1]];
            }
            longtext = text1.length > text2.length ? text1 : text2;
            shorttext = text1.length > text2.length ? text2 : text1;
            i = longtext.indexOf(shorttext);
            if (i !== -1) {
              diffs = [[DIFF_INSERT, longtext.substring(0, i)], [DIFF_EQUAL, shorttext], [DIFF_INSERT, longtext.substring(i + shorttext.length)]];
              if (text1.length > text2.length) {
                diffs[0][0] = diffs[2][0] = DIFF_DELETE;
              }
              return diffs;
            }
            if (shorttext.length === 1) {
              return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
            }
            hm = this.diffHalfMatch(text1, text2);
            if (hm) {
              text1A = hm[0];
              text1B = hm[1];
              text2A = hm[2];
              text2B = hm[3];
              midCommon = hm[4];
              diffsA = this.DiffMain(text1A, text2A, checklines, deadline);
              diffsB = this.DiffMain(text1B, text2B, checklines, deadline);
              return diffsA.concat([[DIFF_EQUAL, midCommon]], diffsB);
            }
            if (checklines && text1.length > 100 && text2.length > 100) {
              return this.diffLineMode(text1, text2, deadline);
            }
            return this.diffBisect(text1, text2, deadline);
          };
          DiffMatchPatch.prototype.diffHalfMatch = function(text1, text2) {
            var longtext, shorttext, dmp, text1A, text2B, text2A, text1B, midCommon, hm1, hm2, hm;
            longtext = text1.length > text2.length ? text1 : text2;
            shorttext = text1.length > text2.length ? text2 : text1;
            if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
              return null;
            }
            dmp = this;
            function diffHalfMatchI(longtext2, shorttext2, i) {
              var seed, j, bestCommon, prefixLength, suffixLength, bestLongtextA, bestLongtextB, bestShorttextA, bestShorttextB;
              seed = longtext2.substring(i, i + Math.floor(longtext2.length / 4));
              j = -1;
              bestCommon = "";
              while ((j = shorttext2.indexOf(seed, j + 1)) !== -1) {
                prefixLength = dmp.diffCommonPrefix(longtext2.substring(i), shorttext2.substring(j));
                suffixLength = dmp.diffCommonSuffix(longtext2.substring(0, i), shorttext2.substring(0, j));
                if (bestCommon.length < suffixLength + prefixLength) {
                  bestCommon = shorttext2.substring(j - suffixLength, j) + shorttext2.substring(j, j + prefixLength);
                  bestLongtextA = longtext2.substring(0, i - suffixLength);
                  bestLongtextB = longtext2.substring(i + prefixLength);
                  bestShorttextA = shorttext2.substring(0, j - suffixLength);
                  bestShorttextB = shorttext2.substring(j + prefixLength);
                }
              }
              if (bestCommon.length * 2 >= longtext2.length) {
                return [bestLongtextA, bestLongtextB, bestShorttextA, bestShorttextB, bestCommon];
              } else {
                return null;
              }
            }
            hm1 = diffHalfMatchI(longtext, shorttext, Math.ceil(longtext.length / 4));
            hm2 = diffHalfMatchI(longtext, shorttext, Math.ceil(longtext.length / 2));
            if (!hm1 && !hm2) {
              return null;
            } else if (!hm2) {
              hm = hm1;
            } else if (!hm1) {
              hm = hm2;
            } else {
              hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
            }
            if (text1.length > text2.length) {
              text1A = hm[0];
              text1B = hm[1];
              text2A = hm[2];
              text2B = hm[3];
            } else {
              text2A = hm[0];
              text2B = hm[1];
              text1A = hm[2];
              text1B = hm[3];
            }
            midCommon = hm[4];
            return [text1A, text1B, text2A, text2B, midCommon];
          };
          DiffMatchPatch.prototype.diffLineMode = function(text1, text2, deadline) {
            var a, diffs, linearray, pointer, countInsert, countDelete, textInsert, textDelete, j;
            a = this.diffLinesToChars(text1, text2);
            text1 = a.chars1;
            text2 = a.chars2;
            linearray = a.lineArray;
            diffs = this.DiffMain(text1, text2, false, deadline);
            this.diffCharsToLines(diffs, linearray);
            this.diffCleanupSemantic(diffs);
            diffs.push([DIFF_EQUAL, ""]);
            pointer = 0;
            countDelete = 0;
            countInsert = 0;
            textDelete = "";
            textInsert = "";
            while (pointer < diffs.length) {
              switch (diffs[pointer][0]) {
                case DIFF_INSERT:
                  countInsert++;
                  textInsert += diffs[pointer][1];
                  break;
                case DIFF_DELETE:
                  countDelete++;
                  textDelete += diffs[pointer][1];
                  break;
                case DIFF_EQUAL:
                  if (countDelete >= 1 && countInsert >= 1) {
                    diffs.splice(pointer - countDelete - countInsert, countDelete + countInsert);
                    pointer = pointer - countDelete - countInsert;
                    a = this.DiffMain(textDelete, textInsert, false, deadline);
                    for (j = a.length - 1; j >= 0; j--) {
                      diffs.splice(pointer, 0, a[j]);
                    }
                    pointer = pointer + a.length;
                  }
                  countInsert = 0;
                  countDelete = 0;
                  textDelete = "";
                  textInsert = "";
                  break;
              }
              pointer++;
            }
            diffs.pop();
            return diffs;
          };
          DiffMatchPatch.prototype.diffBisect = function(text1, text2, deadline) {
            var text1Length, text2Length, maxD, vOffset, vLength, v1, v2, x, delta, front, k1start, k1end, k2start, k2end, k2Offset, k1Offset, x1, x2, y1, y2, d, k1, k2;
            text1Length = text1.length;
            text2Length = text2.length;
            maxD = Math.ceil((text1Length + text2Length) / 2);
            vOffset = maxD;
            vLength = 2 * maxD;
            v1 = new Array(vLength);
            v2 = new Array(vLength);
            for (x = 0; x < vLength; x++) {
              v1[x] = -1;
              v2[x] = -1;
            }
            v1[vOffset + 1] = 0;
            v2[vOffset + 1] = 0;
            delta = text1Length - text2Length;
            front = delta % 2 !== 0;
            k1start = 0;
            k1end = 0;
            k2start = 0;
            k2end = 0;
            for (d = 0; d < maxD; d++) {
              if (new Date().getTime() > deadline) {
                break;
              }
              for (k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
                k1Offset = vOffset + k1;
                if (k1 === -d || k1 !== d && v1[k1Offset - 1] < v1[k1Offset + 1]) {
                  x1 = v1[k1Offset + 1];
                } else {
                  x1 = v1[k1Offset - 1] + 1;
                }
                y1 = x1 - k1;
                while (x1 < text1Length && y1 < text2Length && text1.charAt(x1) === text2.charAt(y1)) {
                  x1++;
                  y1++;
                }
                v1[k1Offset] = x1;
                if (x1 > text1Length) {
                  k1end += 2;
                } else if (y1 > text2Length) {
                  k1start += 2;
                } else if (front) {
                  k2Offset = vOffset + delta - k1;
                  if (k2Offset >= 0 && k2Offset < vLength && v2[k2Offset] !== -1) {
                    x2 = text1Length - v2[k2Offset];
                    if (x1 >= x2) {
                      return this.diffBisectSplit(text1, text2, x1, y1, deadline);
                    }
                  }
                }
              }
              for (k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
                k2Offset = vOffset + k2;
                if (k2 === -d || k2 !== d && v2[k2Offset - 1] < v2[k2Offset + 1]) {
                  x2 = v2[k2Offset + 1];
                } else {
                  x2 = v2[k2Offset - 1] + 1;
                }
                y2 = x2 - k2;
                while (x2 < text1Length && y2 < text2Length && text1.charAt(text1Length - x2 - 1) === text2.charAt(text2Length - y2 - 1)) {
                  x2++;
                  y2++;
                }
                v2[k2Offset] = x2;
                if (x2 > text1Length) {
                  k2end += 2;
                } else if (y2 > text2Length) {
                  k2start += 2;
                } else if (!front) {
                  k1Offset = vOffset + delta - k2;
                  if (k1Offset >= 0 && k1Offset < vLength && v1[k1Offset] !== -1) {
                    x1 = v1[k1Offset];
                    y1 = vOffset + x1 - k1Offset;
                    x2 = text1Length - x2;
                    if (x1 >= x2) {
                      return this.diffBisectSplit(text1, text2, x1, y1, deadline);
                    }
                  }
                }
              }
            }
            return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
          };
          DiffMatchPatch.prototype.diffBisectSplit = function(text1, text2, x, y, deadline) {
            var text1a, text1b, text2a, text2b, diffs, diffsb;
            text1a = text1.substring(0, x);
            text2a = text2.substring(0, y);
            text1b = text1.substring(x);
            text2b = text2.substring(y);
            diffs = this.DiffMain(text1a, text2a, false, deadline);
            diffsb = this.DiffMain(text1b, text2b, false, deadline);
            return diffs.concat(diffsb);
          };
          DiffMatchPatch.prototype.diffCleanupSemantic = function(diffs) {
            var changes, equalities, equalitiesLength, lastequality, pointer, lengthInsertions2, lengthDeletions2, lengthInsertions1, lengthDeletions1, deletion, insertion, overlapLength1, overlapLength2;
            changes = false;
            equalities = [];
            equalitiesLength = 0;
            lastequality = null;
            pointer = 0;
            lengthInsertions1 = 0;
            lengthDeletions1 = 0;
            lengthInsertions2 = 0;
            lengthDeletions2 = 0;
            while (pointer < diffs.length) {
              if (diffs[pointer][0] === DIFF_EQUAL) {
                equalities[equalitiesLength++] = pointer;
                lengthInsertions1 = lengthInsertions2;
                lengthDeletions1 = lengthDeletions2;
                lengthInsertions2 = 0;
                lengthDeletions2 = 0;
                lastequality = diffs[pointer][1];
              } else {
                if (diffs[pointer][0] === DIFF_INSERT) {
                  lengthInsertions2 += diffs[pointer][1].length;
                } else {
                  lengthDeletions2 += diffs[pointer][1].length;
                }
                if (lastequality && lastequality.length <= Math.max(lengthInsertions1, lengthDeletions1) && lastequality.length <= Math.max(lengthInsertions2, lengthDeletions2)) {
                  diffs.splice(equalities[equalitiesLength - 1], 0, [DIFF_DELETE, lastequality]);
                  diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
                  equalitiesLength--;
                  equalitiesLength--;
                  pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
                  lengthInsertions1 = 0;
                  lengthDeletions1 = 0;
                  lengthInsertions2 = 0;
                  lengthDeletions2 = 0;
                  lastequality = null;
                  changes = true;
                }
              }
              pointer++;
            }
            if (changes) {
              this.diffCleanupMerge(diffs);
            }
            pointer = 1;
            while (pointer < diffs.length) {
              if (diffs[pointer - 1][0] === DIFF_DELETE && diffs[pointer][0] === DIFF_INSERT) {
                deletion = diffs[pointer - 1][1];
                insertion = diffs[pointer][1];
                overlapLength1 = this.diffCommonOverlap(deletion, insertion);
                overlapLength2 = this.diffCommonOverlap(insertion, deletion);
                if (overlapLength1 >= overlapLength2) {
                  if (overlapLength1 >= deletion.length / 2 || overlapLength1 >= insertion.length / 2) {
                    diffs.splice(pointer, 0, [DIFF_EQUAL, insertion.substring(0, overlapLength1)]);
                    diffs[pointer - 1][1] = deletion.substring(0, deletion.length - overlapLength1);
                    diffs[pointer + 1][1] = insertion.substring(overlapLength1);
                    pointer++;
                  }
                } else {
                  if (overlapLength2 >= deletion.length / 2 || overlapLength2 >= insertion.length / 2) {
                    diffs.splice(pointer, 0, [DIFF_EQUAL, deletion.substring(0, overlapLength2)]);
                    diffs[pointer - 1][0] = DIFF_INSERT;
                    diffs[pointer - 1][1] = insertion.substring(0, insertion.length - overlapLength2);
                    diffs[pointer + 1][0] = DIFF_DELETE;
                    diffs[pointer + 1][1] = deletion.substring(overlapLength2);
                    pointer++;
                  }
                }
                pointer++;
              }
              pointer++;
            }
          };
          DiffMatchPatch.prototype.diffCommonOverlap = function(text1, text2) {
            var text1Length, text2Length, textLength, best, length, pattern, found;
            text1Length = text1.length;
            text2Length = text2.length;
            if (text1Length === 0 || text2Length === 0) {
              return 0;
            }
            if (text1Length > text2Length) {
              text1 = text1.substring(text1Length - text2Length);
            } else if (text1Length < text2Length) {
              text2 = text2.substring(0, text1Length);
            }
            textLength = Math.min(text1Length, text2Length);
            if (text1 === text2) {
              return textLength;
            }
            best = 0;
            length = 1;
            while (true) {
              pattern = text1.substring(textLength - length);
              found = text2.indexOf(pattern);
              if (found === -1) {
                return best;
              }
              length += found;
              if (found === 0 || text1.substring(textLength - length) === text2.substring(0, length)) {
                best = length;
                length++;
              }
            }
          };
          DiffMatchPatch.prototype.diffLinesToChars = function(text1, text2) {
            var lineArray, lineHash, chars1, chars2;
            lineArray = [];
            lineHash = {};
            lineArray[0] = "";
            function diffLinesToCharsMunge(text) {
              var chars, lineStart, lineEnd, lineArrayLength, line;
              chars = "";
              lineStart = 0;
              lineEnd = -1;
              lineArrayLength = lineArray.length;
              while (lineEnd < text.length - 1) {
                lineEnd = text.indexOf("\n", lineStart);
                if (lineEnd === -1) {
                  lineEnd = text.length - 1;
                }
                line = text.substring(lineStart, lineEnd + 1);
                lineStart = lineEnd + 1;
                if (hasOwn2.call(lineHash, line)) {
                  chars += String.fromCharCode(lineHash[line]);
                } else {
                  chars += String.fromCharCode(lineArrayLength);
                  lineHash[line] = lineArrayLength;
                  lineArray[lineArrayLength++] = line;
                }
              }
              return chars;
            }
            chars1 = diffLinesToCharsMunge(text1);
            chars2 = diffLinesToCharsMunge(text2);
            return {
              chars1,
              chars2,
              lineArray
            };
          };
          DiffMatchPatch.prototype.diffCharsToLines = function(diffs, lineArray) {
            var x, chars, text, y;
            for (x = 0; x < diffs.length; x++) {
              chars = diffs[x][1];
              text = [];
              for (y = 0; y < chars.length; y++) {
                text[y] = lineArray[chars.charCodeAt(y)];
              }
              diffs[x][1] = text.join("");
            }
          };
          DiffMatchPatch.prototype.diffCleanupMerge = function(diffs) {
            var pointer, countDelete, countInsert, textInsert, textDelete, commonlength, changes, diffPointer, position;
            diffs.push([DIFF_EQUAL, ""]);
            pointer = 0;
            countDelete = 0;
            countInsert = 0;
            textDelete = "";
            textInsert = "";
            while (pointer < diffs.length) {
              switch (diffs[pointer][0]) {
                case DIFF_INSERT:
                  countInsert++;
                  textInsert += diffs[pointer][1];
                  pointer++;
                  break;
                case DIFF_DELETE:
                  countDelete++;
                  textDelete += diffs[pointer][1];
                  pointer++;
                  break;
                case DIFF_EQUAL:
                  if (countDelete + countInsert > 1) {
                    if (countDelete !== 0 && countInsert !== 0) {
                      commonlength = this.diffCommonPrefix(textInsert, textDelete);
                      if (commonlength !== 0) {
                        if (pointer - countDelete - countInsert > 0 && diffs[pointer - countDelete - countInsert - 1][0] === DIFF_EQUAL) {
                          diffs[pointer - countDelete - countInsert - 1][1] += textInsert.substring(0, commonlength);
                        } else {
                          diffs.splice(0, 0, [DIFF_EQUAL, textInsert.substring(0, commonlength)]);
                          pointer++;
                        }
                        textInsert = textInsert.substring(commonlength);
                        textDelete = textDelete.substring(commonlength);
                      }
                      commonlength = this.diffCommonSuffix(textInsert, textDelete);
                      if (commonlength !== 0) {
                        diffs[pointer][1] = textInsert.substring(textInsert.length - commonlength) + diffs[pointer][1];
                        textInsert = textInsert.substring(0, textInsert.length - commonlength);
                        textDelete = textDelete.substring(0, textDelete.length - commonlength);
                      }
                    }
                    if (countDelete === 0) {
                      diffs.splice(pointer - countInsert, countDelete + countInsert, [DIFF_INSERT, textInsert]);
                    } else if (countInsert === 0) {
                      diffs.splice(pointer - countDelete, countDelete + countInsert, [DIFF_DELETE, textDelete]);
                    } else {
                      diffs.splice(pointer - countDelete - countInsert, countDelete + countInsert, [DIFF_DELETE, textDelete], [DIFF_INSERT, textInsert]);
                    }
                    pointer = pointer - countDelete - countInsert + (countDelete ? 1 : 0) + (countInsert ? 1 : 0) + 1;
                  } else if (pointer !== 0 && diffs[pointer - 1][0] === DIFF_EQUAL) {
                    diffs[pointer - 1][1] += diffs[pointer][1];
                    diffs.splice(pointer, 1);
                  } else {
                    pointer++;
                  }
                  countInsert = 0;
                  countDelete = 0;
                  textDelete = "";
                  textInsert = "";
                  break;
              }
            }
            if (diffs[diffs.length - 1][1] === "") {
              diffs.pop();
            }
            changes = false;
            pointer = 1;
            while (pointer < diffs.length - 1) {
              if (diffs[pointer - 1][0] === DIFF_EQUAL && diffs[pointer + 1][0] === DIFF_EQUAL) {
                diffPointer = diffs[pointer][1];
                position = diffPointer.substring(diffPointer.length - diffs[pointer - 1][1].length);
                if (position === diffs[pointer - 1][1]) {
                  diffs[pointer][1] = diffs[pointer - 1][1] + diffs[pointer][1].substring(0, diffs[pointer][1].length - diffs[pointer - 1][1].length);
                  diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
                  diffs.splice(pointer - 1, 1);
                  changes = true;
                } else if (diffPointer.substring(0, diffs[pointer + 1][1].length) === diffs[pointer + 1][1]) {
                  diffs[pointer - 1][1] += diffs[pointer + 1][1];
                  diffs[pointer][1] = diffs[pointer][1].substring(diffs[pointer + 1][1].length) + diffs[pointer + 1][1];
                  diffs.splice(pointer + 1, 1);
                  changes = true;
                }
              }
              pointer++;
            }
            if (changes) {
              this.diffCleanupMerge(diffs);
            }
          };
          return function(o, n) {
            var diff2, output, text;
            diff2 = new DiffMatchPatch();
            output = diff2.DiffMain(o, n);
            diff2.diffCleanupEfficiency(output);
            text = diff2.diffPrettyHtml(output);
            return text;
          };
        }();
      })();
    }
  });

  // node_modules/rescript/lib/js/js_int.js
  var require_js_int = __commonJS({
    "node_modules/rescript/lib/js/js_int.js"(exports) {
      "use strict";
      function equal(x, y) {
        return x === y;
      }
      var max = 2147483647;
      var min = -2147483648;
      exports.equal = equal;
      exports.max = max;
      exports.min = min;
    }
  });

  // node_modules/rescript/lib/js/js_math.js
  var require_js_math = __commonJS({
    "node_modules/rescript/lib/js/js_math.js"(exports) {
      "use strict";
      var Js_int = require_js_int();
      function unsafe_ceil(prim) {
        return Math.ceil(prim);
      }
      function ceil_int(f) {
        if (f > Js_int.max) {
          return Js_int.max;
        } else if (f < Js_int.min) {
          return Js_int.min;
        } else {
          return Math.ceil(f);
        }
      }
      function unsafe_floor(prim) {
        return Math.floor(prim);
      }
      function floor_int(f) {
        if (f > Js_int.max) {
          return Js_int.max;
        } else if (f < Js_int.min) {
          return Js_int.min;
        } else {
          return Math.floor(f);
        }
      }
      function random_int(min, max) {
        return floor_int(Math.random() * (max - min | 0)) + min | 0;
      }
      var ceil = ceil_int;
      var floor = floor_int;
      exports.unsafe_ceil = unsafe_ceil;
      exports.ceil_int = ceil_int;
      exports.ceil = ceil;
      exports.unsafe_floor = unsafe_floor;
      exports.floor_int = floor_int;
      exports.floor = floor;
      exports.random_int = random_int;
    }
  });

  // node_modules/rescript/lib/js/caml.js
  var require_caml = __commonJS({
    "node_modules/rescript/lib/js/caml.js"(exports) {
      "use strict";
      function caml_int_compare(x, y) {
        if (x < y) {
          return -1;
        } else if (x === y) {
          return 0;
        } else {
          return 1;
        }
      }
      function caml_bool_compare(x, y) {
        if (x) {
          if (y) {
            return 0;
          } else {
            return 1;
          }
        } else if (y) {
          return -1;
        } else {
          return 0;
        }
      }
      function caml_float_compare(x, y) {
        if (x === y) {
          return 0;
        } else if (x < y) {
          return -1;
        } else if (x > y || x === x) {
          return 1;
        } else if (y === y) {
          return -1;
        } else {
          return 0;
        }
      }
      function caml_string_compare(s1, s2) {
        if (s1 === s2) {
          return 0;
        } else if (s1 < s2) {
          return -1;
        } else {
          return 1;
        }
      }
      function caml_bool_min(x, y) {
        if (x) {
          return y;
        } else {
          return x;
        }
      }
      function caml_int_min(x, y) {
        if (x < y) {
          return x;
        } else {
          return y;
        }
      }
      function caml_float_min(x, y) {
        if (x < y) {
          return x;
        } else {
          return y;
        }
      }
      function caml_string_min(x, y) {
        if (x < y) {
          return x;
        } else {
          return y;
        }
      }
      function caml_int32_min(x, y) {
        if (x < y) {
          return x;
        } else {
          return y;
        }
      }
      function caml_bool_max(x, y) {
        if (x) {
          return x;
        } else {
          return y;
        }
      }
      function caml_int_max(x, y) {
        if (x > y) {
          return x;
        } else {
          return y;
        }
      }
      function caml_float_max(x, y) {
        if (x > y) {
          return x;
        } else {
          return y;
        }
      }
      function caml_string_max(x, y) {
        if (x > y) {
          return x;
        } else {
          return y;
        }
      }
      function caml_int32_max(x, y) {
        if (x > y) {
          return x;
        } else {
          return y;
        }
      }
      function i64_eq(x, y) {
        if (x[1] === y[1]) {
          return x[0] === y[0];
        } else {
          return false;
        }
      }
      function i64_ge(param, param$1) {
        var other_hi = param$1[0];
        var hi = param[0];
        if (hi > other_hi) {
          return true;
        } else if (hi < other_hi) {
          return false;
        } else {
          return param[1] >= param$1[1];
        }
      }
      function i64_neq(x, y) {
        return !i64_eq(x, y);
      }
      function i64_lt(x, y) {
        return !i64_ge(x, y);
      }
      function i64_gt(x, y) {
        if (x[0] > y[0]) {
          return true;
        } else if (x[0] < y[0]) {
          return false;
        } else {
          return x[1] > y[1];
        }
      }
      function i64_le(x, y) {
        return !i64_gt(x, y);
      }
      function i64_min(x, y) {
        if (i64_ge(x, y)) {
          return y;
        } else {
          return x;
        }
      }
      function i64_max(x, y) {
        if (i64_gt(x, y)) {
          return x;
        } else {
          return y;
        }
      }
      exports.caml_int_compare = caml_int_compare;
      exports.caml_bool_compare = caml_bool_compare;
      exports.caml_float_compare = caml_float_compare;
      exports.caml_string_compare = caml_string_compare;
      exports.caml_bool_min = caml_bool_min;
      exports.caml_int_min = caml_int_min;
      exports.caml_float_min = caml_float_min;
      exports.caml_string_min = caml_string_min;
      exports.caml_int32_min = caml_int32_min;
      exports.caml_bool_max = caml_bool_max;
      exports.caml_int_max = caml_int_max;
      exports.caml_float_max = caml_float_max;
      exports.caml_string_max = caml_string_max;
      exports.caml_int32_max = caml_int32_max;
      exports.i64_eq = i64_eq;
      exports.i64_neq = i64_neq;
      exports.i64_lt = i64_lt;
      exports.i64_gt = i64_gt;
      exports.i64_le = i64_le;
      exports.i64_ge = i64_ge;
      exports.i64_min = i64_min;
      exports.i64_max = i64_max;
    }
  });

  // node_modules/rescript/lib/js/caml_option.js
  var require_caml_option = __commonJS({
    "node_modules/rescript/lib/js/caml_option.js"(exports) {
      "use strict";
      function isNested(x) {
        return x.BS_PRIVATE_NESTED_SOME_NONE !== void 0;
      }
      function some(x) {
        if (x === void 0) {
          return {
            BS_PRIVATE_NESTED_SOME_NONE: 0
          };
        } else if (x !== null && x.BS_PRIVATE_NESTED_SOME_NONE !== void 0) {
          return {
            BS_PRIVATE_NESTED_SOME_NONE: x.BS_PRIVATE_NESTED_SOME_NONE + 1 | 0
          };
        } else {
          return x;
        }
      }
      function nullable_to_opt(x) {
        if (x == null) {
          return;
        } else {
          return some(x);
        }
      }
      function undefined_to_opt(x) {
        if (x === void 0) {
          return;
        } else {
          return some(x);
        }
      }
      function null_to_opt(x) {
        if (x === null) {
          return;
        } else {
          return some(x);
        }
      }
      function valFromOption(x) {
        if (!(x !== null && x.BS_PRIVATE_NESTED_SOME_NONE !== void 0)) {
          return x;
        }
        var depth = x.BS_PRIVATE_NESTED_SOME_NONE;
        if (depth === 0) {
          return;
        } else {
          return {
            BS_PRIVATE_NESTED_SOME_NONE: depth - 1 | 0
          };
        }
      }
      function option_get(x) {
        if (x === void 0) {
          return;
        } else {
          return valFromOption(x);
        }
      }
      function option_unwrap(x) {
        if (x !== void 0) {
          return x.VAL;
        } else {
          return x;
        }
      }
      exports.nullable_to_opt = nullable_to_opt;
      exports.undefined_to_opt = undefined_to_opt;
      exports.null_to_opt = null_to_opt;
      exports.valFromOption = valFromOption;
      exports.some = some;
      exports.isNested = isNested;
      exports.option_get = option_get;
      exports.option_unwrap = option_unwrap;
    }
  });

  // node_modules/rescript/lib/js/belt_Array.js
  var require_belt_Array = __commonJS({
    "node_modules/rescript/lib/js/belt_Array.js"(exports) {
      "use strict";
      var Caml = require_caml();
      var Curry = require_curry();
      var Js_math = require_js_math();
      var Caml_option = require_caml_option();
      function get(arr, i) {
        if (i >= 0 && i < arr.length) {
          return Caml_option.some(arr[i]);
        }
      }
      function getExn(arr, i) {
        if (!(i >= 0 && i < arr.length)) {
          throw {
            RE_EXN_ID: "Assert_failure",
            _1: [
              "belt_Array.ml",
              27,
              4
            ],
            Error: new Error()
          };
        }
        return arr[i];
      }
      function set(arr, i, v) {
        if (i >= 0 && i < arr.length) {
          arr[i] = v;
          return true;
        } else {
          return false;
        }
      }
      function setExn(arr, i, v) {
        if (!(i >= 0 && i < arr.length)) {
          throw {
            RE_EXN_ID: "Assert_failure",
            _1: [
              "belt_Array.ml",
              33,
              2
            ],
            Error: new Error()
          };
        }
        arr[i] = v;
      }
      function swapUnsafe(xs, i, j) {
        var tmp = xs[i];
        xs[i] = xs[j];
        xs[j] = tmp;
      }
      function shuffleInPlace(xs) {
        var len = xs.length;
        for (var i = 0; i < len; ++i) {
          swapUnsafe(xs, i, Js_math.random_int(i, len));
        }
      }
      function shuffle(xs) {
        var result = xs.slice(0);
        shuffleInPlace(result);
        return result;
      }
      function reverseInPlace(xs) {
        var len = xs.length;
        var ofs = 0;
        for (var i = 0, i_finish = len / 2 | 0; i < i_finish; ++i) {
          swapUnsafe(xs, ofs + i | 0, ((ofs + len | 0) - i | 0) - 1 | 0);
        }
      }
      function reverse(xs) {
        var len = xs.length;
        var result = new Array(len);
        for (var i = 0; i < len; ++i) {
          result[i] = xs[(len - 1 | 0) - i | 0];
        }
        return result;
      }
      function make(l, f) {
        if (l <= 0) {
          return [];
        }
        var res = new Array(l);
        for (var i = 0; i < l; ++i) {
          res[i] = f;
        }
        return res;
      }
      function makeByU(l, f) {
        if (l <= 0) {
          return [];
        }
        var res = new Array(l);
        for (var i = 0; i < l; ++i) {
          res[i] = f(i);
        }
        return res;
      }
      function makeBy(l, f) {
        return makeByU(l, Curry.__1(f));
      }
      function makeByAndShuffleU(l, f) {
        var u = makeByU(l, f);
        shuffleInPlace(u);
        return u;
      }
      function makeByAndShuffle(l, f) {
        return makeByAndShuffleU(l, Curry.__1(f));
      }
      function range(start, finish) {
        var cut = finish - start | 0;
        if (cut < 0) {
          return [];
        }
        var arr = new Array(cut + 1 | 0);
        for (var i = 0; i <= cut; ++i) {
          arr[i] = start + i | 0;
        }
        return arr;
      }
      function rangeBy(start, finish, step) {
        var cut = finish - start | 0;
        if (cut < 0 || step <= 0) {
          return [];
        }
        var nb = (cut / step | 0) + 1 | 0;
        var arr = new Array(nb);
        var cur = start;
        for (var i = 0; i < nb; ++i) {
          arr[i] = cur;
          cur = cur + step | 0;
        }
        return arr;
      }
      function zip(xs, ys) {
        var lenx = xs.length;
        var leny = ys.length;
        var len = lenx < leny ? lenx : leny;
        var s = new Array(len);
        for (var i = 0; i < len; ++i) {
          s[i] = [
            xs[i],
            ys[i]
          ];
        }
        return s;
      }
      function zipByU(xs, ys, f) {
        var lenx = xs.length;
        var leny = ys.length;
        var len = lenx < leny ? lenx : leny;
        var s = new Array(len);
        for (var i = 0; i < len; ++i) {
          s[i] = f(xs[i], ys[i]);
        }
        return s;
      }
      function zipBy(xs, ys, f) {
        return zipByU(xs, ys, Curry.__2(f));
      }
      function concat(a1, a2) {
        var l1 = a1.length;
        var l2 = a2.length;
        var a1a2 = new Array(l1 + l2 | 0);
        for (var i = 0; i < l1; ++i) {
          a1a2[i] = a1[i];
        }
        for (var i$1 = 0; i$1 < l2; ++i$1) {
          a1a2[l1 + i$1 | 0] = a2[i$1];
        }
        return a1a2;
      }
      function concatMany(arrs) {
        var lenArrs = arrs.length;
        var totalLen = 0;
        for (var i = 0; i < lenArrs; ++i) {
          totalLen = totalLen + arrs[i].length | 0;
        }
        var result = new Array(totalLen);
        totalLen = 0;
        for (var j = 0; j < lenArrs; ++j) {
          var cur = arrs[j];
          for (var k = 0, k_finish = cur.length; k < k_finish; ++k) {
            result[totalLen] = cur[k];
            totalLen = totalLen + 1 | 0;
          }
        }
        return result;
      }
      function slice(a, offset, len) {
        if (len <= 0) {
          return [];
        }
        var lena = a.length;
        var ofs = offset < 0 ? Caml.caml_int_max(lena + offset | 0, 0) : offset;
        var hasLen = lena - ofs | 0;
        var copyLength = hasLen < len ? hasLen : len;
        if (copyLength <= 0) {
          return [];
        }
        var result = new Array(copyLength);
        for (var i = 0; i < copyLength; ++i) {
          result[i] = a[ofs + i | 0];
        }
        return result;
      }
      function sliceToEnd(a, offset) {
        var lena = a.length;
        var ofs = offset < 0 ? Caml.caml_int_max(lena + offset | 0, 0) : offset;
        var len = lena - ofs | 0;
        var result = new Array(len);
        for (var i = 0; i < len; ++i) {
          result[i] = a[ofs + i | 0];
        }
        return result;
      }
      function fill(a, offset, len, v) {
        if (len <= 0) {
          return;
        }
        var lena = a.length;
        var ofs = offset < 0 ? Caml.caml_int_max(lena + offset | 0, 0) : offset;
        var hasLen = lena - ofs | 0;
        var fillLength = hasLen < len ? hasLen : len;
        if (fillLength <= 0) {
          return;
        }
        for (var i = ofs, i_finish = ofs + fillLength | 0; i < i_finish; ++i) {
          a[i] = v;
        }
      }
      function blitUnsafe(a1, srcofs1, a2, srcofs2, blitLength) {
        if (srcofs2 <= srcofs1) {
          for (var j = 0; j < blitLength; ++j) {
            a2[j + srcofs2 | 0] = a1[j + srcofs1 | 0];
          }
          return;
        }
        for (var j$1 = blitLength - 1 | 0; j$1 >= 0; --j$1) {
          a2[j$1 + srcofs2 | 0] = a1[j$1 + srcofs1 | 0];
        }
      }
      function blit(a1, ofs1, a2, ofs2, len) {
        var lena1 = a1.length;
        var lena2 = a2.length;
        var srcofs1 = ofs1 < 0 ? Caml.caml_int_max(lena1 + ofs1 | 0, 0) : ofs1;
        var srcofs2 = ofs2 < 0 ? Caml.caml_int_max(lena2 + ofs2 | 0, 0) : ofs2;
        var blitLength = Caml.caml_int_min(len, Caml.caml_int_min(lena1 - srcofs1 | 0, lena2 - srcofs2 | 0));
        if (srcofs2 <= srcofs1) {
          for (var j = 0; j < blitLength; ++j) {
            a2[j + srcofs2 | 0] = a1[j + srcofs1 | 0];
          }
          return;
        }
        for (var j$1 = blitLength - 1 | 0; j$1 >= 0; --j$1) {
          a2[j$1 + srcofs2 | 0] = a1[j$1 + srcofs1 | 0];
        }
      }
      function forEachU(a, f) {
        for (var i = 0, i_finish = a.length; i < i_finish; ++i) {
          f(a[i]);
        }
      }
      function forEach(a, f) {
        return forEachU(a, Curry.__1(f));
      }
      function mapU(a, f) {
        var l = a.length;
        var r = new Array(l);
        for (var i = 0; i < l; ++i) {
          r[i] = f(a[i]);
        }
        return r;
      }
      function map(a, f) {
        return mapU(a, Curry.__1(f));
      }
      function getByU(a, p) {
        var l = a.length;
        var i = 0;
        var r;
        while (r === void 0 && i < l) {
          var v = a[i];
          if (p(v)) {
            r = Caml_option.some(v);
          }
          i = i + 1 | 0;
        }
        ;
        return r;
      }
      function getBy(a, p) {
        return getByU(a, Curry.__1(p));
      }
      function getIndexByU(a, p) {
        var l = a.length;
        var i = 0;
        var r;
        while (r === void 0 && i < l) {
          var v = a[i];
          if (p(v)) {
            r = i;
          }
          i = i + 1 | 0;
        }
        ;
        return r;
      }
      function getIndexBy(a, p) {
        return getIndexByU(a, Curry.__1(p));
      }
      function keepU(a, f) {
        var l = a.length;
        var r = new Array(l);
        var j = 0;
        for (var i = 0; i < l; ++i) {
          var v = a[i];
          if (f(v)) {
            r[j] = v;
            j = j + 1 | 0;
          }
        }
        r.length = j;
        return r;
      }
      function keep(a, f) {
        return keepU(a, Curry.__1(f));
      }
      function keepWithIndexU(a, f) {
        var l = a.length;
        var r = new Array(l);
        var j = 0;
        for (var i = 0; i < l; ++i) {
          var v = a[i];
          if (f(v, i)) {
            r[j] = v;
            j = j + 1 | 0;
          }
        }
        r.length = j;
        return r;
      }
      function keepWithIndex(a, f) {
        return keepWithIndexU(a, Curry.__2(f));
      }
      function keepMapU(a, f) {
        var l = a.length;
        var r = new Array(l);
        var j = 0;
        for (var i = 0; i < l; ++i) {
          var v = a[i];
          var v$1 = f(v);
          if (v$1 !== void 0) {
            r[j] = Caml_option.valFromOption(v$1);
            j = j + 1 | 0;
          }
        }
        r.length = j;
        return r;
      }
      function keepMap(a, f) {
        return keepMapU(a, Curry.__1(f));
      }
      function forEachWithIndexU(a, f) {
        for (var i = 0, i_finish = a.length; i < i_finish; ++i) {
          f(i, a[i]);
        }
      }
      function forEachWithIndex(a, f) {
        return forEachWithIndexU(a, Curry.__2(f));
      }
      function mapWithIndexU(a, f) {
        var l = a.length;
        var r = new Array(l);
        for (var i = 0; i < l; ++i) {
          r[i] = f(i, a[i]);
        }
        return r;
      }
      function mapWithIndex(a, f) {
        return mapWithIndexU(a, Curry.__2(f));
      }
      function reduceU(a, x, f) {
        var r = x;
        for (var i = 0, i_finish = a.length; i < i_finish; ++i) {
          r = f(r, a[i]);
        }
        return r;
      }
      function reduce(a, x, f) {
        return reduceU(a, x, Curry.__2(f));
      }
      function reduceReverseU(a, x, f) {
        var r = x;
        for (var i = a.length - 1 | 0; i >= 0; --i) {
          r = f(r, a[i]);
        }
        return r;
      }
      function reduceReverse(a, x, f) {
        return reduceReverseU(a, x, Curry.__2(f));
      }
      function reduceReverse2U(a, b, x, f) {
        var r = x;
        var len = Caml.caml_int_min(a.length, b.length);
        for (var i = len - 1 | 0; i >= 0; --i) {
          r = f(r, a[i], b[i]);
        }
        return r;
      }
      function reduceReverse2(a, b, x, f) {
        return reduceReverse2U(a, b, x, Curry.__3(f));
      }
      function reduceWithIndexU(a, x, f) {
        var r = x;
        for (var i = 0, i_finish = a.length; i < i_finish; ++i) {
          r = f(r, a[i], i);
        }
        return r;
      }
      function reduceWithIndex(a, x, f) {
        return reduceWithIndexU(a, x, Curry.__3(f));
      }
      function everyU(arr, b) {
        var len = arr.length;
        var _i = 0;
        while (true) {
          var i = _i;
          if (i === len) {
            return true;
          }
          if (!b(arr[i])) {
            return false;
          }
          _i = i + 1 | 0;
          continue;
        }
        ;
      }
      function every(arr, f) {
        return everyU(arr, Curry.__1(f));
      }
      function someU(arr, b) {
        var len = arr.length;
        var _i = 0;
        while (true) {
          var i = _i;
          if (i === len) {
            return false;
          }
          if (b(arr[i])) {
            return true;
          }
          _i = i + 1 | 0;
          continue;
        }
        ;
      }
      function some(arr, f) {
        return someU(arr, Curry.__1(f));
      }
      function everyAux2(arr1, arr2, _i, b, len) {
        while (true) {
          var i = _i;
          if (i === len) {
            return true;
          }
          if (!b(arr1[i], arr2[i])) {
            return false;
          }
          _i = i + 1 | 0;
          continue;
        }
        ;
      }
      function every2U(a, b, p) {
        return everyAux2(a, b, 0, p, Caml.caml_int_min(a.length, b.length));
      }
      function every2(a, b, p) {
        return every2U(a, b, Curry.__2(p));
      }
      function some2U(a, b, p) {
        var _i = 0;
        var len = Caml.caml_int_min(a.length, b.length);
        while (true) {
          var i = _i;
          if (i === len) {
            return false;
          }
          if (p(a[i], b[i])) {
            return true;
          }
          _i = i + 1 | 0;
          continue;
        }
        ;
      }
      function some2(a, b, p) {
        return some2U(a, b, Curry.__2(p));
      }
      function eqU(a, b, p) {
        var lena = a.length;
        var lenb = b.length;
        if (lena === lenb) {
          return everyAux2(a, b, 0, p, lena);
        } else {
          return false;
        }
      }
      function eq(a, b, p) {
        return eqU(a, b, Curry.__2(p));
      }
      function cmpU(a, b, p) {
        var lena = a.length;
        var lenb = b.length;
        if (lena > lenb) {
          return 1;
        } else if (lena < lenb) {
          return -1;
        } else {
          var _i = 0;
          while (true) {
            var i = _i;
            if (i === lena) {
              return 0;
            }
            var c = p(a[i], b[i]);
            if (c !== 0) {
              return c;
            }
            _i = i + 1 | 0;
            continue;
          }
          ;
        }
      }
      function cmp(a, b, p) {
        return cmpU(a, b, Curry.__2(p));
      }
      function partitionU(a, f) {
        var l = a.length;
        var i = 0;
        var j = 0;
        var a1 = new Array(l);
        var a2 = new Array(l);
        for (var ii = 0; ii < l; ++ii) {
          var v = a[ii];
          if (f(v)) {
            a1[i] = v;
            i = i + 1 | 0;
          } else {
            a2[j] = v;
            j = j + 1 | 0;
          }
        }
        a1.length = i;
        a2.length = j;
        return [
          a1,
          a2
        ];
      }
      function partition(a, f) {
        return partitionU(a, Curry.__1(f));
      }
      function unzip(a) {
        var l = a.length;
        var a1 = new Array(l);
        var a2 = new Array(l);
        for (var i = 0; i < l; ++i) {
          var match = a[i];
          a1[i] = match[0];
          a2[i] = match[1];
        }
        return [
          a1,
          a2
        ];
      }
      function joinWithU(a, sep, toString) {
        var l = a.length;
        if (l === 0) {
          return "";
        }
        var lastIndex = l - 1 | 0;
        var _i = 0;
        var _res = "";
        while (true) {
          var res = _res;
          var i = _i;
          if (i === lastIndex) {
            return res + toString(a[i]);
          }
          _res = res + (toString(a[i]) + sep);
          _i = i + 1 | 0;
          continue;
        }
        ;
      }
      function joinWith(a, sep, toString) {
        return joinWithU(a, sep, Curry.__1(toString));
      }
      exports.get = get;
      exports.getExn = getExn;
      exports.set = set;
      exports.setExn = setExn;
      exports.shuffleInPlace = shuffleInPlace;
      exports.shuffle = shuffle;
      exports.reverseInPlace = reverseInPlace;
      exports.reverse = reverse;
      exports.make = make;
      exports.range = range;
      exports.rangeBy = rangeBy;
      exports.makeByU = makeByU;
      exports.makeBy = makeBy;
      exports.makeByAndShuffleU = makeByAndShuffleU;
      exports.makeByAndShuffle = makeByAndShuffle;
      exports.zip = zip;
      exports.zipByU = zipByU;
      exports.zipBy = zipBy;
      exports.unzip = unzip;
      exports.concat = concat;
      exports.concatMany = concatMany;
      exports.slice = slice;
      exports.sliceToEnd = sliceToEnd;
      exports.fill = fill;
      exports.blit = blit;
      exports.blitUnsafe = blitUnsafe;
      exports.forEachU = forEachU;
      exports.forEach = forEach;
      exports.mapU = mapU;
      exports.map = map;
      exports.getByU = getByU;
      exports.getBy = getBy;
      exports.getIndexByU = getIndexByU;
      exports.getIndexBy = getIndexBy;
      exports.keepU = keepU;
      exports.keep = keep;
      exports.keepWithIndexU = keepWithIndexU;
      exports.keepWithIndex = keepWithIndex;
      exports.keepMapU = keepMapU;
      exports.keepMap = keepMap;
      exports.forEachWithIndexU = forEachWithIndexU;
      exports.forEachWithIndex = forEachWithIndex;
      exports.mapWithIndexU = mapWithIndexU;
      exports.mapWithIndex = mapWithIndex;
      exports.partitionU = partitionU;
      exports.partition = partition;
      exports.reduceU = reduceU;
      exports.reduce = reduce;
      exports.reduceReverseU = reduceReverseU;
      exports.reduceReverse = reduceReverse;
      exports.reduceReverse2U = reduceReverse2U;
      exports.reduceReverse2 = reduceReverse2;
      exports.reduceWithIndexU = reduceWithIndexU;
      exports.reduceWithIndex = reduceWithIndex;
      exports.joinWithU = joinWithU;
      exports.joinWith = joinWith;
      exports.someU = someU;
      exports.some = some;
      exports.everyU = everyU;
      exports.every = every;
      exports.every2U = every2U;
      exports.every2 = every2;
      exports.some2U = some2U;
      exports.some2 = some2;
      exports.cmpU = cmpU;
      exports.cmp = cmp;
      exports.eqU = eqU;
      exports.eq = eq;
    }
  });

  // node_modules/rescript/lib/js/belt_SortArray.js
  var require_belt_SortArray = __commonJS({
    "node_modules/rescript/lib/js/belt_SortArray.js"(exports) {
      "use strict";
      var Curry = require_curry();
      var Belt_Array = require_belt_Array();
      function sortedLengthAuxMore(xs, _prec, _acc, len, lt) {
        while (true) {
          var acc = _acc;
          var prec = _prec;
          if (acc >= len) {
            return acc;
          }
          var v = xs[acc];
          if (!lt(v, prec)) {
            return acc;
          }
          _acc = acc + 1 | 0;
          _prec = v;
          continue;
        }
        ;
      }
      function strictlySortedLengthU(xs, lt) {
        var len = xs.length;
        if (len === 0 || len === 1) {
          return len;
        }
        var x0 = xs[0];
        var x1 = xs[1];
        if (lt(x0, x1)) {
          var _prec = x1;
          var _acc = 2;
          while (true) {
            var acc = _acc;
            var prec = _prec;
            if (acc >= len) {
              return acc;
            }
            var v = xs[acc];
            if (!lt(prec, v)) {
              return acc;
            }
            _acc = acc + 1 | 0;
            _prec = v;
            continue;
          }
          ;
        } else if (lt(x1, x0)) {
          return -sortedLengthAuxMore(xs, x1, 2, len, lt) | 0;
        } else {
          return 1;
        }
      }
      function strictlySortedLength(xs, lt) {
        return strictlySortedLengthU(xs, Curry.__2(lt));
      }
      function isSortedU(a, cmp) {
        var len = a.length;
        if (len === 0) {
          return true;
        } else {
          var _i = 0;
          var last_bound = len - 1 | 0;
          while (true) {
            var i = _i;
            if (i === last_bound) {
              return true;
            }
            if (cmp(a[i], a[i + 1 | 0]) > 0) {
              return false;
            }
            _i = i + 1 | 0;
            continue;
          }
          ;
        }
      }
      function isSorted(a, cmp) {
        return isSortedU(a, Curry.__2(cmp));
      }
      function merge(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, cmp) {
        var src1r = src1ofs + src1len | 0;
        var src2r = src2ofs + src2len | 0;
        var _i1 = src1ofs;
        var _s1 = src[src1ofs];
        var _i2 = src2ofs;
        var _s2 = src2[src2ofs];
        var _d = dstofs;
        while (true) {
          var d = _d;
          var s2 = _s2;
          var i2 = _i2;
          var s1 = _s1;
          var i1 = _i1;
          if (cmp(s1, s2) <= 0) {
            dst[d] = s1;
            var i1$1 = i1 + 1 | 0;
            if (i1$1 >= src1r) {
              return Belt_Array.blitUnsafe(src2, i2, dst, d + 1 | 0, src2r - i2 | 0);
            }
            _d = d + 1 | 0;
            _s1 = src[i1$1];
            _i1 = i1$1;
            continue;
          }
          dst[d] = s2;
          var i2$1 = i2 + 1 | 0;
          if (i2$1 >= src2r) {
            return Belt_Array.blitUnsafe(src, i1, dst, d + 1 | 0, src1r - i1 | 0);
          }
          _d = d + 1 | 0;
          _s2 = src2[i2$1];
          _i2 = i2$1;
          continue;
        }
        ;
      }
      function unionU(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, cmp) {
        var src1r = src1ofs + src1len | 0;
        var src2r = src2ofs + src2len | 0;
        var _i1 = src1ofs;
        var _s1 = src[src1ofs];
        var _i2 = src2ofs;
        var _s2 = src2[src2ofs];
        var _d = dstofs;
        while (true) {
          var d = _d;
          var s2 = _s2;
          var i2 = _i2;
          var s1 = _s1;
          var i1 = _i1;
          var c = cmp(s1, s2);
          if (c < 0) {
            dst[d] = s1;
            var i1$1 = i1 + 1 | 0;
            var d$1 = d + 1 | 0;
            if (i1$1 < src1r) {
              _d = d$1;
              _s1 = src[i1$1];
              _i1 = i1$1;
              continue;
            }
            Belt_Array.blitUnsafe(src2, i2, dst, d$1, src2r - i2 | 0);
            return (d$1 + src2r | 0) - i2 | 0;
          }
          if (c === 0) {
            dst[d] = s1;
            var i1$2 = i1 + 1 | 0;
            var i2$1 = i2 + 1 | 0;
            var d$2 = d + 1 | 0;
            if (!(i1$2 < src1r && i2$1 < src2r)) {
              if (i1$2 === src1r) {
                Belt_Array.blitUnsafe(src2, i2$1, dst, d$2, src2r - i2$1 | 0);
                return (d$2 + src2r | 0) - i2$1 | 0;
              } else {
                Belt_Array.blitUnsafe(src, i1$2, dst, d$2, src1r - i1$2 | 0);
                return (d$2 + src1r | 0) - i1$2 | 0;
              }
            }
            _d = d$2;
            _s2 = src2[i2$1];
            _i2 = i2$1;
            _s1 = src[i1$2];
            _i1 = i1$2;
            continue;
          }
          dst[d] = s2;
          var i2$2 = i2 + 1 | 0;
          var d$3 = d + 1 | 0;
          if (i2$2 < src2r) {
            _d = d$3;
            _s2 = src2[i2$2];
            _i2 = i2$2;
            continue;
          }
          Belt_Array.blitUnsafe(src, i1, dst, d$3, src1r - i1 | 0);
          return (d$3 + src1r | 0) - i1 | 0;
        }
        ;
      }
      function union(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, cmp) {
        return unionU(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, Curry.__2(cmp));
      }
      function intersectU(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, cmp) {
        var src1r = src1ofs + src1len | 0;
        var src2r = src2ofs + src2len | 0;
        var _i1 = src1ofs;
        var _s1 = src[src1ofs];
        var _i2 = src2ofs;
        var _s2 = src2[src2ofs];
        var _d = dstofs;
        while (true) {
          var d = _d;
          var s2 = _s2;
          var i2 = _i2;
          var s1 = _s1;
          var i1 = _i1;
          var c = cmp(s1, s2);
          if (c < 0) {
            var i1$1 = i1 + 1 | 0;
            if (i1$1 >= src1r) {
              return d;
            }
            _s1 = src[i1$1];
            _i1 = i1$1;
            continue;
          }
          if (c === 0) {
            dst[d] = s1;
            var i1$2 = i1 + 1 | 0;
            var i2$1 = i2 + 1 | 0;
            var d$1 = d + 1 | 0;
            if (!(i1$2 < src1r && i2$1 < src2r)) {
              return d$1;
            }
            _d = d$1;
            _s2 = src2[i2$1];
            _i2 = i2$1;
            _s1 = src[i1$2];
            _i1 = i1$2;
            continue;
          }
          var i2$2 = i2 + 1 | 0;
          if (i2$2 >= src2r) {
            return d;
          }
          _s2 = src2[i2$2];
          _i2 = i2$2;
          continue;
        }
        ;
      }
      function intersect(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, cmp) {
        return intersectU(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, Curry.__2(cmp));
      }
      function diffU(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, cmp) {
        var src1r = src1ofs + src1len | 0;
        var src2r = src2ofs + src2len | 0;
        var _i1 = src1ofs;
        var _s1 = src[src1ofs];
        var _i2 = src2ofs;
        var _s2 = src2[src2ofs];
        var _d = dstofs;
        while (true) {
          var d = _d;
          var s2 = _s2;
          var i2 = _i2;
          var s1 = _s1;
          var i1 = _i1;
          var c = cmp(s1, s2);
          if (c < 0) {
            dst[d] = s1;
            var d$1 = d + 1 | 0;
            var i1$1 = i1 + 1 | 0;
            if (i1$1 >= src1r) {
              return d$1;
            }
            _d = d$1;
            _s1 = src[i1$1];
            _i1 = i1$1;
            continue;
          }
          if (c === 0) {
            var i1$2 = i1 + 1 | 0;
            var i2$1 = i2 + 1 | 0;
            if (!(i1$2 < src1r && i2$1 < src2r)) {
              if (i1$2 === src1r) {
                return d;
              } else {
                Belt_Array.blitUnsafe(src, i1$2, dst, d, src1r - i1$2 | 0);
                return (d + src1r | 0) - i1$2 | 0;
              }
            }
            _s2 = src2[i2$1];
            _i2 = i2$1;
            _s1 = src[i1$2];
            _i1 = i1$2;
            continue;
          }
          var i2$2 = i2 + 1 | 0;
          if (i2$2 < src2r) {
            _s2 = src2[i2$2];
            _i2 = i2$2;
            continue;
          }
          Belt_Array.blitUnsafe(src, i1, dst, d, src1r - i1 | 0);
          return (d + src1r | 0) - i1 | 0;
        }
        ;
      }
      function diff(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, cmp) {
        return diffU(src, src1ofs, src1len, src2, src2ofs, src2len, dst, dstofs, Curry.__2(cmp));
      }
      function insertionSort(src, srcofs, dst, dstofs, len, cmp) {
        for (var i = 0; i < len; ++i) {
          var e = src[srcofs + i | 0];
          var j = (dstofs + i | 0) - 1 | 0;
          while (j >= dstofs && cmp(dst[j], e) > 0) {
            dst[j + 1 | 0] = dst[j];
            j = j - 1 | 0;
          }
          ;
          dst[j + 1 | 0] = e;
        }
      }
      function sortTo(src, srcofs, dst, dstofs, len, cmp) {
        if (len <= 5) {
          return insertionSort(src, srcofs, dst, dstofs, len, cmp);
        }
        var l1 = len / 2 | 0;
        var l2 = len - l1 | 0;
        sortTo(src, srcofs + l1 | 0, dst, dstofs + l1 | 0, l2, cmp);
        sortTo(src, srcofs, src, srcofs + l2 | 0, l1, cmp);
        return merge(src, srcofs + l2 | 0, l1, dst, dstofs + l1 | 0, l2, dst, dstofs, cmp);
      }
      function stableSortInPlaceByU(a, cmp) {
        var l = a.length;
        if (l <= 5) {
          return insertionSort(a, 0, a, 0, l, cmp);
        }
        var l1 = l / 2 | 0;
        var l2 = l - l1 | 0;
        var t = new Array(l2);
        sortTo(a, l1, t, 0, l2, cmp);
        sortTo(a, 0, a, l2, l1, cmp);
        return merge(a, l2, l1, t, 0, l2, a, 0, cmp);
      }
      function stableSortInPlaceBy(a, cmp) {
        return stableSortInPlaceByU(a, Curry.__2(cmp));
      }
      function stableSortByU(a, cmp) {
        var b = a.slice(0);
        stableSortInPlaceByU(b, cmp);
        return b;
      }
      function stableSortBy(a, cmp) {
        return stableSortByU(a, Curry.__2(cmp));
      }
      function binarySearchByU(sorted, key, cmp) {
        var len = sorted.length;
        if (len === 0) {
          return -1;
        }
        var lo = sorted[0];
        var c = cmp(key, lo);
        if (c < 0) {
          return -1;
        }
        var hi = sorted[len - 1 | 0];
        var c2 = cmp(key, hi);
        if (c2 > 0) {
          return -(len + 1 | 0) | 0;
        } else {
          var _lo = 0;
          var _hi = len - 1 | 0;
          while (true) {
            var hi$1 = _hi;
            var lo$1 = _lo;
            var mid = (lo$1 + hi$1 | 0) / 2 | 0;
            var midVal = sorted[mid];
            var c$1 = cmp(key, midVal);
            if (c$1 === 0) {
              return mid;
            }
            if (c$1 < 0) {
              if (hi$1 === mid) {
                if (cmp(sorted[lo$1], key) === 0) {
                  return lo$1;
                } else {
                  return -(hi$1 + 1 | 0) | 0;
                }
              }
              _hi = mid;
              continue;
            }
            if (lo$1 === mid) {
              if (cmp(sorted[hi$1], key) === 0) {
                return hi$1;
              } else {
                return -(hi$1 + 1 | 0) | 0;
              }
            }
            _lo = mid;
            continue;
          }
          ;
        }
      }
      function binarySearchBy(sorted, key, cmp) {
        return binarySearchByU(sorted, key, Curry.__2(cmp));
      }
      var Int;
      var $$String;
      exports.Int = Int;
      exports.$$String = $$String;
      exports.strictlySortedLengthU = strictlySortedLengthU;
      exports.strictlySortedLength = strictlySortedLength;
      exports.isSortedU = isSortedU;
      exports.isSorted = isSorted;
      exports.stableSortInPlaceByU = stableSortInPlaceByU;
      exports.stableSortInPlaceBy = stableSortInPlaceBy;
      exports.stableSortByU = stableSortByU;
      exports.stableSortBy = stableSortBy;
      exports.binarySearchByU = binarySearchByU;
      exports.binarySearchBy = binarySearchBy;
      exports.unionU = unionU;
      exports.union = union;
      exports.intersectU = intersectU;
      exports.intersect = intersect;
      exports.diffU = diffU;
      exports.diff = diff;
    }
  });

  // node_modules/rescript/lib/js/belt_List.js
  var require_belt_List = __commonJS({
    "node_modules/rescript/lib/js/belt_List.js"(exports) {
      "use strict";
      var Curry = require_curry();
      var Belt_Array = require_belt_Array();
      var Caml_option = require_caml_option();
      var Belt_SortArray = require_belt_SortArray();
      function head(x) {
        if (x) {
          return Caml_option.some(x.hd);
        }
      }
      function headExn(x) {
        if (x) {
          return x.hd;
        }
        throw {
          RE_EXN_ID: "Not_found",
          Error: new Error()
        };
      }
      function tail(x) {
        if (x) {
          return x.tl;
        }
      }
      function tailExn(x) {
        if (x) {
          return x.tl;
        }
        throw {
          RE_EXN_ID: "Not_found",
          Error: new Error()
        };
      }
      function add(xs, x) {
        return {
          hd: x,
          tl: xs
        };
      }
      function get(x, n) {
        if (n < 0) {
          return;
        } else {
          var _x = x;
          var _n = n;
          while (true) {
            var n$1 = _n;
            var x$1 = _x;
            if (!x$1) {
              return;
            }
            if (n$1 === 0) {
              return Caml_option.some(x$1.hd);
            }
            _n = n$1 - 1 | 0;
            _x = x$1.tl;
            continue;
          }
          ;
        }
      }
      function getExn(x, n) {
        if (n < 0) {
          throw {
            RE_EXN_ID: "Not_found",
            Error: new Error()
          };
        }
        var _x = x;
        var _n = n;
        while (true) {
          var n$1 = _n;
          var x$1 = _x;
          if (x$1) {
            if (n$1 === 0) {
              return x$1.hd;
            }
            _n = n$1 - 1 | 0;
            _x = x$1.tl;
            continue;
          }
          throw {
            RE_EXN_ID: "Not_found",
            Error: new Error()
          };
        }
        ;
      }
      function partitionAux(p, _cell, _precX, _precY) {
        while (true) {
          var precY = _precY;
          var precX = _precX;
          var cell = _cell;
          if (!cell) {
            return;
          }
          var t = cell.tl;
          var h = cell.hd;
          var next = {
            hd: h,
            tl: 0
          };
          if (p(h)) {
            precX.tl = next;
            _precX = next;
            _cell = t;
            continue;
          }
          precY.tl = next;
          _precY = next;
          _cell = t;
          continue;
        }
        ;
      }
      function splitAux(_cell, _precX, _precY) {
        while (true) {
          var precY = _precY;
          var precX = _precX;
          var cell = _cell;
          if (!cell) {
            return;
          }
          var match = cell.hd;
          var nextA = {
            hd: match[0],
            tl: 0
          };
          var nextB = {
            hd: match[1],
            tl: 0
          };
          precX.tl = nextA;
          precY.tl = nextB;
          _precY = nextB;
          _precX = nextA;
          _cell = cell.tl;
          continue;
        }
        ;
      }
      function copyAuxCont(_cellX, _prec) {
        while (true) {
          var prec = _prec;
          var cellX = _cellX;
          if (!cellX) {
            return prec;
          }
          var next = {
            hd: cellX.hd,
            tl: 0
          };
          prec.tl = next;
          _prec = next;
          _cellX = cellX.tl;
          continue;
        }
        ;
      }
      function copyAuxWitFilter(f, _cellX, _prec) {
        while (true) {
          var prec = _prec;
          var cellX = _cellX;
          if (!cellX) {
            return;
          }
          var t = cellX.tl;
          var h = cellX.hd;
          if (f(h)) {
            var next = {
              hd: h,
              tl: 0
            };
            prec.tl = next;
            _prec = next;
            _cellX = t;
            continue;
          }
          _cellX = t;
          continue;
        }
        ;
      }
      function copyAuxWithFilterIndex(f, _cellX, _prec, _i) {
        while (true) {
          var i = _i;
          var prec = _prec;
          var cellX = _cellX;
          if (!cellX) {
            return;
          }
          var t = cellX.tl;
          var h = cellX.hd;
          if (f(h, i)) {
            var next = {
              hd: h,
              tl: 0
            };
            prec.tl = next;
            _i = i + 1 | 0;
            _prec = next;
            _cellX = t;
            continue;
          }
          _i = i + 1 | 0;
          _cellX = t;
          continue;
        }
        ;
      }
      function copyAuxWitFilterMap(f, _cellX, _prec) {
        while (true) {
          var prec = _prec;
          var cellX = _cellX;
          if (!cellX) {
            return;
          }
          var t = cellX.tl;
          var h = f(cellX.hd);
          if (h !== void 0) {
            var next = {
              hd: Caml_option.valFromOption(h),
              tl: 0
            };
            prec.tl = next;
            _prec = next;
            _cellX = t;
            continue;
          }
          _cellX = t;
          continue;
        }
        ;
      }
      function removeAssocAuxWithMap(_cellX, x, _prec, f) {
        while (true) {
          var prec = _prec;
          var cellX = _cellX;
          if (!cellX) {
            return false;
          }
          var t = cellX.tl;
          var h = cellX.hd;
          if (f(h[0], x)) {
            prec.tl = t;
            return true;
          }
          var next = {
            hd: h,
            tl: 0
          };
          prec.tl = next;
          _prec = next;
          _cellX = t;
          continue;
        }
        ;
      }
      function setAssocAuxWithMap(_cellX, x, k, _prec, eq2) {
        while (true) {
          var prec = _prec;
          var cellX = _cellX;
          if (!cellX) {
            return false;
          }
          var t = cellX.tl;
          var h = cellX.hd;
          if (eq2(h[0], x)) {
            prec.tl = {
              hd: [
                x,
                k
              ],
              tl: t
            };
            return true;
          }
          var next = {
            hd: h,
            tl: 0
          };
          prec.tl = next;
          _prec = next;
          _cellX = t;
          continue;
        }
        ;
      }
      function copyAuxWithMap(_cellX, _prec, f) {
        while (true) {
          var prec = _prec;
          var cellX = _cellX;
          if (!cellX) {
            return;
          }
          var next = {
            hd: f(cellX.hd),
            tl: 0
          };
          prec.tl = next;
          _prec = next;
          _cellX = cellX.tl;
          continue;
        }
        ;
      }
      function zipAux(_cellX, _cellY, _prec) {
        while (true) {
          var prec = _prec;
          var cellY = _cellY;
          var cellX = _cellX;
          if (!cellX) {
            return;
          }
          if (!cellY) {
            return;
          }
          var next = {
            hd: [
              cellX.hd,
              cellY.hd
            ],
            tl: 0
          };
          prec.tl = next;
          _prec = next;
          _cellY = cellY.tl;
          _cellX = cellX.tl;
          continue;
        }
        ;
      }
      function copyAuxWithMap2(f, _cellX, _cellY, _prec) {
        while (true) {
          var prec = _prec;
          var cellY = _cellY;
          var cellX = _cellX;
          if (!cellX) {
            return;
          }
          if (!cellY) {
            return;
          }
          var next = {
            hd: f(cellX.hd, cellY.hd),
            tl: 0
          };
          prec.tl = next;
          _prec = next;
          _cellY = cellY.tl;
          _cellX = cellX.tl;
          continue;
        }
        ;
      }
      function copyAuxWithMapI(f, _i, _cellX, _prec) {
        while (true) {
          var prec = _prec;
          var cellX = _cellX;
          var i = _i;
          if (!cellX) {
            return;
          }
          var next = {
            hd: f(i, cellX.hd),
            tl: 0
          };
          prec.tl = next;
          _prec = next;
          _cellX = cellX.tl;
          _i = i + 1 | 0;
          continue;
        }
        ;
      }
      function takeAux(_n, _cell, _prec) {
        while (true) {
          var prec = _prec;
          var cell = _cell;
          var n = _n;
          if (n === 0) {
            return true;
          }
          if (!cell) {
            return false;
          }
          var cell$1 = {
            hd: cell.hd,
            tl: 0
          };
          prec.tl = cell$1;
          _prec = cell$1;
          _cell = cell.tl;
          _n = n - 1 | 0;
          continue;
        }
        ;
      }
      function splitAtAux(_n, _cell, _prec) {
        while (true) {
          var prec = _prec;
          var cell = _cell;
          var n = _n;
          if (n === 0) {
            return cell;
          }
          if (!cell) {
            return;
          }
          var cell$1 = {
            hd: cell.hd,
            tl: 0
          };
          prec.tl = cell$1;
          _prec = cell$1;
          _cell = cell.tl;
          _n = n - 1 | 0;
          continue;
        }
        ;
      }
      function take(lst, n) {
        if (n < 0) {
          return;
        }
        if (n === 0) {
          return 0;
        }
        if (!lst) {
          return;
        }
        var cell = {
          hd: lst.hd,
          tl: 0
        };
        var has2 = takeAux(n - 1 | 0, lst.tl, cell);
        if (has2) {
          return cell;
        }
      }
      function drop(lst, n) {
        if (n < 0) {
          return;
        } else {
          var _l = lst;
          var _n = n;
          while (true) {
            var n$1 = _n;
            var l = _l;
            if (n$1 === 0) {
              return l;
            }
            if (!l) {
              return;
            }
            _n = n$1 - 1 | 0;
            _l = l.tl;
            continue;
          }
          ;
        }
      }
      function splitAt(lst, n) {
        if (n < 0) {
          return;
        }
        if (n === 0) {
          return [
            0,
            lst
          ];
        }
        if (!lst) {
          return;
        }
        var cell = {
          hd: lst.hd,
          tl: 0
        };
        var rest = splitAtAux(n - 1 | 0, lst.tl, cell);
        if (rest !== void 0) {
          return [
            cell,
            rest
          ];
        }
      }
      function concat(xs, ys) {
        if (!xs) {
          return ys;
        }
        var cell = {
          hd: xs.hd,
          tl: 0
        };
        copyAuxCont(xs.tl, cell).tl = ys;
        return cell;
      }
      function mapU(xs, f) {
        if (!xs) {
          return 0;
        }
        var cell = {
          hd: f(xs.hd),
          tl: 0
        };
        copyAuxWithMap(xs.tl, cell, f);
        return cell;
      }
      function map(xs, f) {
        return mapU(xs, Curry.__1(f));
      }
      function zipByU(l1, l2, f) {
        if (!l1) {
          return 0;
        }
        if (!l2) {
          return 0;
        }
        var cell = {
          hd: f(l1.hd, l2.hd),
          tl: 0
        };
        copyAuxWithMap2(f, l1.tl, l2.tl, cell);
        return cell;
      }
      function zipBy(l1, l2, f) {
        return zipByU(l1, l2, Curry.__2(f));
      }
      function mapWithIndexU(xs, f) {
        if (!xs) {
          return 0;
        }
        var cell = {
          hd: f(0, xs.hd),
          tl: 0
        };
        copyAuxWithMapI(f, 1, xs.tl, cell);
        return cell;
      }
      function mapWithIndex(xs, f) {
        return mapWithIndexU(xs, Curry.__2(f));
      }
      function makeByU(n, f) {
        if (n <= 0) {
          return 0;
        }
        var headX = {
          hd: f(0),
          tl: 0
        };
        var cur = headX;
        var i = 1;
        while (i < n) {
          var v = {
            hd: f(i),
            tl: 0
          };
          cur.tl = v;
          cur = v;
          i = i + 1 | 0;
        }
        ;
        return headX;
      }
      function makeBy(n, f) {
        return makeByU(n, Curry.__1(f));
      }
      function make(n, v) {
        if (n <= 0) {
          return 0;
        }
        var headX = {
          hd: v,
          tl: 0
        };
        var cur = headX;
        var i = 1;
        while (i < n) {
          var v$1 = {
            hd: v,
            tl: 0
          };
          cur.tl = v$1;
          cur = v$1;
          i = i + 1 | 0;
        }
        ;
        return headX;
      }
      function length(xs) {
        var _x = xs;
        var _acc = 0;
        while (true) {
          var acc = _acc;
          var x = _x;
          if (!x) {
            return acc;
          }
          _acc = acc + 1 | 0;
          _x = x.tl;
          continue;
        }
        ;
      }
      function fillAux(arr, _i, _x) {
        while (true) {
          var x = _x;
          var i = _i;
          if (!x) {
            return;
          }
          arr[i] = x.hd;
          _x = x.tl;
          _i = i + 1 | 0;
          continue;
        }
        ;
      }
      function fromArray(a) {
        var _i = a.length - 1 | 0;
        var _res = 0;
        while (true) {
          var res = _res;
          var i = _i;
          if (i < 0) {
            return res;
          }
          _res = {
            hd: a[i],
            tl: res
          };
          _i = i - 1 | 0;
          continue;
        }
        ;
      }
      function toArray(x) {
        var len = length(x);
        var arr = new Array(len);
        fillAux(arr, 0, x);
        return arr;
      }
      function shuffle(xs) {
        var v = toArray(xs);
        Belt_Array.shuffleInPlace(v);
        return fromArray(v);
      }
      function reverseConcat(_l1, _l2) {
        while (true) {
          var l2 = _l2;
          var l1 = _l1;
          if (!l1) {
            return l2;
          }
          _l2 = {
            hd: l1.hd,
            tl: l2
          };
          _l1 = l1.tl;
          continue;
        }
        ;
      }
      function reverse(l) {
        return reverseConcat(l, 0);
      }
      function flattenAux(_prec, _xs) {
        while (true) {
          var xs = _xs;
          var prec = _prec;
          if (xs) {
            _xs = xs.tl;
            _prec = copyAuxCont(xs.hd, prec);
            continue;
          }
          prec.tl = 0;
          return;
        }
        ;
      }
      function flatten(_xs) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return 0;
          }
          var match = xs.hd;
          if (match) {
            var cell = {
              hd: match.hd,
              tl: 0
            };
            flattenAux(copyAuxCont(match.tl, cell), xs.tl);
            return cell;
          }
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function concatMany(xs) {
        var len = xs.length;
        if (len === 1) {
          return xs[0];
        }
        if (len === 0) {
          return 0;
        }
        var len$1 = xs.length;
        var v = xs[len$1 - 1 | 0];
        for (var i = len$1 - 2 | 0; i >= 0; --i) {
          v = concat(xs[i], v);
        }
        return v;
      }
      function mapReverseU(l, f) {
        var _accu = 0;
        var _xs = l;
        while (true) {
          var xs = _xs;
          var accu = _accu;
          if (!xs) {
            return accu;
          }
          _xs = xs.tl;
          _accu = {
            hd: f(xs.hd),
            tl: accu
          };
          continue;
        }
        ;
      }
      function mapReverse(l, f) {
        return mapReverseU(l, Curry.__1(f));
      }
      function forEachU(_xs, f) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return;
          }
          f(xs.hd);
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function forEach(xs, f) {
        return forEachU(xs, Curry.__1(f));
      }
      function forEachWithIndexU(l, f) {
        var _xs = l;
        var _i = 0;
        while (true) {
          var i = _i;
          var xs = _xs;
          if (!xs) {
            return;
          }
          f(i, xs.hd);
          _i = i + 1 | 0;
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function forEachWithIndex(l, f) {
        return forEachWithIndexU(l, Curry.__2(f));
      }
      function reduceU(_l, _accu, f) {
        while (true) {
          var accu = _accu;
          var l = _l;
          if (!l) {
            return accu;
          }
          _accu = f(accu, l.hd);
          _l = l.tl;
          continue;
        }
        ;
      }
      function reduce(l, accu, f) {
        return reduceU(l, accu, Curry.__2(f));
      }
      function reduceReverseUnsafeU(l, accu, f) {
        if (l) {
          return f(reduceReverseUnsafeU(l.tl, accu, f), l.hd);
        } else {
          return accu;
        }
      }
      function reduceReverseU(l, acc, f) {
        var len = length(l);
        if (len < 1e3) {
          return reduceReverseUnsafeU(l, acc, f);
        } else {
          return Belt_Array.reduceReverseU(toArray(l), acc, f);
        }
      }
      function reduceReverse(l, accu, f) {
        return reduceReverseU(l, accu, Curry.__2(f));
      }
      function reduceWithIndexU(l, acc, f) {
        var _l = l;
        var _acc = acc;
        var _i = 0;
        while (true) {
          var i = _i;
          var acc$1 = _acc;
          var l$1 = _l;
          if (!l$1) {
            return acc$1;
          }
          _i = i + 1 | 0;
          _acc = f(acc$1, l$1.hd, i);
          _l = l$1.tl;
          continue;
        }
        ;
      }
      function reduceWithIndex(l, acc, f) {
        return reduceWithIndexU(l, acc, Curry.__3(f));
      }
      function mapReverse2U(l1, l2, f) {
        var _l1 = l1;
        var _l2 = l2;
        var _accu = 0;
        while (true) {
          var accu = _accu;
          var l2$1 = _l2;
          var l1$1 = _l1;
          if (!l1$1) {
            return accu;
          }
          if (!l2$1) {
            return accu;
          }
          _accu = {
            hd: f(l1$1.hd, l2$1.hd),
            tl: accu
          };
          _l2 = l2$1.tl;
          _l1 = l1$1.tl;
          continue;
        }
        ;
      }
      function mapReverse2(l1, l2, f) {
        return mapReverse2U(l1, l2, Curry.__2(f));
      }
      function forEach2U(_l1, _l2, f) {
        while (true) {
          var l2 = _l2;
          var l1 = _l1;
          if (!l1) {
            return;
          }
          if (!l2) {
            return;
          }
          f(l1.hd, l2.hd);
          _l2 = l2.tl;
          _l1 = l1.tl;
          continue;
        }
        ;
      }
      function forEach2(l1, l2, f) {
        return forEach2U(l1, l2, Curry.__2(f));
      }
      function reduce2U(_l1, _l2, _accu, f) {
        while (true) {
          var accu = _accu;
          var l2 = _l2;
          var l1 = _l1;
          if (!l1) {
            return accu;
          }
          if (!l2) {
            return accu;
          }
          _accu = f(accu, l1.hd, l2.hd);
          _l2 = l2.tl;
          _l1 = l1.tl;
          continue;
        }
        ;
      }
      function reduce2(l1, l2, acc, f) {
        return reduce2U(l1, l2, acc, Curry.__3(f));
      }
      function reduceReverse2UnsafeU(l1, l2, accu, f) {
        if (l1 && l2) {
          return f(reduceReverse2UnsafeU(l1.tl, l2.tl, accu, f), l1.hd, l2.hd);
        } else {
          return accu;
        }
      }
      function reduceReverse2U(l1, l2, acc, f) {
        var len = length(l1);
        if (len < 1e3) {
          return reduceReverse2UnsafeU(l1, l2, acc, f);
        } else {
          return Belt_Array.reduceReverse2U(toArray(l1), toArray(l2), acc, f);
        }
      }
      function reduceReverse2(l1, l2, acc, f) {
        return reduceReverse2U(l1, l2, acc, Curry.__3(f));
      }
      function everyU(_xs, p) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return true;
          }
          if (!p(xs.hd)) {
            return false;
          }
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function every(xs, p) {
        return everyU(xs, Curry.__1(p));
      }
      function someU(_xs, p) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return false;
          }
          if (p(xs.hd)) {
            return true;
          }
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function some(xs, p) {
        return someU(xs, Curry.__1(p));
      }
      function every2U(_l1, _l2, p) {
        while (true) {
          var l2 = _l2;
          var l1 = _l1;
          if (!l1) {
            return true;
          }
          if (!l2) {
            return true;
          }
          if (!p(l1.hd, l2.hd)) {
            return false;
          }
          _l2 = l2.tl;
          _l1 = l1.tl;
          continue;
        }
        ;
      }
      function every2(l1, l2, p) {
        return every2U(l1, l2, Curry.__2(p));
      }
      function cmpByLength(_l1, _l2) {
        while (true) {
          var l2 = _l2;
          var l1 = _l1;
          if (!l1) {
            if (l2) {
              return -1;
            } else {
              return 0;
            }
          }
          if (!l2) {
            return 1;
          }
          _l2 = l2.tl;
          _l1 = l1.tl;
          continue;
        }
        ;
      }
      function cmpU(_l1, _l2, p) {
        while (true) {
          var l2 = _l2;
          var l1 = _l1;
          if (!l1) {
            if (l2) {
              return -1;
            } else {
              return 0;
            }
          }
          if (!l2) {
            return 1;
          }
          var c = p(l1.hd, l2.hd);
          if (c !== 0) {
            return c;
          }
          _l2 = l2.tl;
          _l1 = l1.tl;
          continue;
        }
        ;
      }
      function cmp(l1, l2, f) {
        return cmpU(l1, l2, Curry.__2(f));
      }
      function eqU(_l1, _l2, p) {
        while (true) {
          var l2 = _l2;
          var l1 = _l1;
          if (!l1) {
            if (l2) {
              return false;
            } else {
              return true;
            }
          }
          if (!l2) {
            return false;
          }
          if (!p(l1.hd, l2.hd)) {
            return false;
          }
          _l2 = l2.tl;
          _l1 = l1.tl;
          continue;
        }
        ;
      }
      function eq(l1, l2, f) {
        return eqU(l1, l2, Curry.__2(f));
      }
      function some2U(_l1, _l2, p) {
        while (true) {
          var l2 = _l2;
          var l1 = _l1;
          if (!l1) {
            return false;
          }
          if (!l2) {
            return false;
          }
          if (p(l1.hd, l2.hd)) {
            return true;
          }
          _l2 = l2.tl;
          _l1 = l1.tl;
          continue;
        }
        ;
      }
      function some2(l1, l2, p) {
        return some2U(l1, l2, Curry.__2(p));
      }
      function hasU(_xs, x, eq2) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return false;
          }
          if (eq2(xs.hd, x)) {
            return true;
          }
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function has(xs, x, eq2) {
        return hasU(xs, x, Curry.__2(eq2));
      }
      function getAssocU(_xs, x, eq2) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return;
          }
          var match = xs.hd;
          if (eq2(match[0], x)) {
            return Caml_option.some(match[1]);
          }
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function getAssoc(xs, x, eq2) {
        return getAssocU(xs, x, Curry.__2(eq2));
      }
      function hasAssocU(_xs, x, eq2) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return false;
          }
          if (eq2(xs.hd[0], x)) {
            return true;
          }
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function hasAssoc(xs, x, eq2) {
        return hasAssocU(xs, x, Curry.__2(eq2));
      }
      function removeAssocU(xs, x, eq2) {
        if (!xs) {
          return 0;
        }
        var l = xs.tl;
        var pair = xs.hd;
        if (eq2(pair[0], x)) {
          return l;
        }
        var cell = {
          hd: pair,
          tl: 0
        };
        var removed = removeAssocAuxWithMap(l, x, cell, eq2);
        if (removed) {
          return cell;
        } else {
          return xs;
        }
      }
      function removeAssoc(xs, x, eq2) {
        return removeAssocU(xs, x, Curry.__2(eq2));
      }
      function setAssocU(xs, x, k, eq2) {
        if (!xs) {
          return {
            hd: [
              x,
              k
            ],
            tl: 0
          };
        }
        var l = xs.tl;
        var pair = xs.hd;
        if (eq2(pair[0], x)) {
          return {
            hd: [
              x,
              k
            ],
            tl: l
          };
        }
        var cell = {
          hd: pair,
          tl: 0
        };
        var replaced = setAssocAuxWithMap(l, x, k, cell, eq2);
        if (replaced) {
          return cell;
        } else {
          return {
            hd: [
              x,
              k
            ],
            tl: xs
          };
        }
      }
      function setAssoc(xs, x, k, eq2) {
        return setAssocU(xs, x, k, Curry.__2(eq2));
      }
      function sortU(xs, cmp2) {
        var arr = toArray(xs);
        Belt_SortArray.stableSortInPlaceByU(arr, cmp2);
        return fromArray(arr);
      }
      function sort(xs, cmp2) {
        return sortU(xs, Curry.__2(cmp2));
      }
      function getByU(_xs, p) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return;
          }
          var x = xs.hd;
          if (p(x)) {
            return Caml_option.some(x);
          }
          _xs = xs.tl;
          continue;
        }
        ;
      }
      function getBy(xs, p) {
        return getByU(xs, Curry.__1(p));
      }
      function keepU(_xs, p) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return 0;
          }
          var t = xs.tl;
          var h = xs.hd;
          if (p(h)) {
            var cell = {
              hd: h,
              tl: 0
            };
            copyAuxWitFilter(p, t, cell);
            return cell;
          }
          _xs = t;
          continue;
        }
        ;
      }
      function keep(xs, p) {
        return keepU(xs, Curry.__1(p));
      }
      function keepWithIndexU(xs, p) {
        var _xs = xs;
        var _i = 0;
        while (true) {
          var i = _i;
          var xs$1 = _xs;
          if (!xs$1) {
            return 0;
          }
          var t = xs$1.tl;
          var h = xs$1.hd;
          if (p(h, i)) {
            var cell = {
              hd: h,
              tl: 0
            };
            copyAuxWithFilterIndex(p, t, cell, i + 1 | 0);
            return cell;
          }
          _i = i + 1 | 0;
          _xs = t;
          continue;
        }
        ;
      }
      function keepWithIndex(xs, p) {
        return keepWithIndexU(xs, Curry.__2(p));
      }
      function keepMapU(_xs, p) {
        while (true) {
          var xs = _xs;
          if (!xs) {
            return 0;
          }
          var t = xs.tl;
          var h = p(xs.hd);
          if (h !== void 0) {
            var cell = {
              hd: Caml_option.valFromOption(h),
              tl: 0
            };
            copyAuxWitFilterMap(p, t, cell);
            return cell;
          }
          _xs = t;
          continue;
        }
        ;
      }
      function keepMap(xs, p) {
        return keepMapU(xs, Curry.__1(p));
      }
      function partitionU(l, p) {
        if (!l) {
          return [
            0,
            0
          ];
        }
        var h = l.hd;
        var nextX = {
          hd: h,
          tl: 0
        };
        var nextY = {
          hd: h,
          tl: 0
        };
        var b = p(h);
        partitionAux(p, l.tl, nextX, nextY);
        if (b) {
          return [
            nextX,
            nextY.tl
          ];
        } else {
          return [
            nextX.tl,
            nextY
          ];
        }
      }
      function partition(l, p) {
        return partitionU(l, Curry.__1(p));
      }
      function unzip(xs) {
        if (!xs) {
          return [
            0,
            0
          ];
        }
        var match = xs.hd;
        var cellX = {
          hd: match[0],
          tl: 0
        };
        var cellY = {
          hd: match[1],
          tl: 0
        };
        splitAux(xs.tl, cellX, cellY);
        return [
          cellX,
          cellY
        ];
      }
      function zip(l1, l2) {
        if (!l1) {
          return 0;
        }
        if (!l2) {
          return 0;
        }
        var cell = {
          hd: [
            l1.hd,
            l2.hd
          ],
          tl: 0
        };
        zipAux(l1.tl, l2.tl, cell);
        return cell;
      }
      var size = length;
      var filter = keep;
      var filterWithIndex = keepWithIndex;
      exports.length = length;
      exports.size = size;
      exports.head = head;
      exports.headExn = headExn;
      exports.tail = tail;
      exports.tailExn = tailExn;
      exports.add = add;
      exports.get = get;
      exports.getExn = getExn;
      exports.make = make;
      exports.makeByU = makeByU;
      exports.makeBy = makeBy;
      exports.shuffle = shuffle;
      exports.drop = drop;
      exports.take = take;
      exports.splitAt = splitAt;
      exports.concat = concat;
      exports.concatMany = concatMany;
      exports.reverseConcat = reverseConcat;
      exports.flatten = flatten;
      exports.mapU = mapU;
      exports.map = map;
      exports.zip = zip;
      exports.zipByU = zipByU;
      exports.zipBy = zipBy;
      exports.mapWithIndexU = mapWithIndexU;
      exports.mapWithIndex = mapWithIndex;
      exports.fromArray = fromArray;
      exports.toArray = toArray;
      exports.reverse = reverse;
      exports.mapReverseU = mapReverseU;
      exports.mapReverse = mapReverse;
      exports.forEachU = forEachU;
      exports.forEach = forEach;
      exports.forEachWithIndexU = forEachWithIndexU;
      exports.forEachWithIndex = forEachWithIndex;
      exports.reduceU = reduceU;
      exports.reduce = reduce;
      exports.reduceWithIndexU = reduceWithIndexU;
      exports.reduceWithIndex = reduceWithIndex;
      exports.reduceReverseU = reduceReverseU;
      exports.reduceReverse = reduceReverse;
      exports.mapReverse2U = mapReverse2U;
      exports.mapReverse2 = mapReverse2;
      exports.forEach2U = forEach2U;
      exports.forEach2 = forEach2;
      exports.reduce2U = reduce2U;
      exports.reduce2 = reduce2;
      exports.reduceReverse2U = reduceReverse2U;
      exports.reduceReverse2 = reduceReverse2;
      exports.everyU = everyU;
      exports.every = every;
      exports.someU = someU;
      exports.some = some;
      exports.every2U = every2U;
      exports.every2 = every2;
      exports.some2U = some2U;
      exports.some2 = some2;
      exports.cmpByLength = cmpByLength;
      exports.cmpU = cmpU;
      exports.cmp = cmp;
      exports.eqU = eqU;
      exports.eq = eq;
      exports.hasU = hasU;
      exports.has = has;
      exports.getByU = getByU;
      exports.getBy = getBy;
      exports.keepU = keepU;
      exports.keep = keep;
      exports.filter = filter;
      exports.keepWithIndexU = keepWithIndexU;
      exports.keepWithIndex = keepWithIndex;
      exports.filterWithIndex = filterWithIndex;
      exports.keepMapU = keepMapU;
      exports.keepMap = keepMap;
      exports.partitionU = partitionU;
      exports.partition = partition;
      exports.unzip = unzip;
      exports.getAssocU = getAssocU;
      exports.getAssoc = getAssoc;
      exports.hasAssocU = hasAssocU;
      exports.hasAssoc = hasAssoc;
      exports.removeAssocU = removeAssocU;
      exports.removeAssoc = removeAssoc;
      exports.setAssocU = setAssocU;
      exports.setAssoc = setAssoc;
      exports.sortU = sortU;
      exports.sort = sort;
    }
  });

  // lib/js/src/ReIndexed.js
  var require_ReIndexed = __commonJS({
    "lib/js/src/ReIndexed.js"(exports) {
      "use strict";
      var IDB = require_IDB();
      var Curry = require_curry();
      var Belt_Array = require_belt_Array();
      var Caml_option = require_caml_option();
      function MakeDatabase(Database) {
        var connection = {
          db: void 0
        };
        var connect = function(name) {
          var migrations = Curry._1(Database.migrations, void 0);
          var upgrade = function(db, oldVersion, newVersion, transaction2) {
            console.log("Migrating from version", oldVersion, "to", newVersion);
            return Belt_Array.forEach(Belt_Array.slice(migrations, oldVersion, newVersion - oldVersion | 0), function(migration) {
              return Curry._2(migration, db, transaction2);
            });
          };
          var __x = IDB.Database.connect(name, migrations.length, upgrade);
          return __x.then(function(db) {
            connection.db = Caml_option.some(db);
            return Promise.resolve(db);
          });
        };
        var MakeModel = function(Model) {
          return {};
        };
        var MakeQuery = function(Query) {
          var $$do = function(request) {
            var db = connection.db;
            if (db !== void 0) {
              return Curry._2(IDB.Database.transaction, Caml_option.valFromOption(db), request);
            } else {
              return new Promise(function(resolve, reject) {
                return resolve(Curry._1(Query.makeResponse, void 0));
              });
            }
          };
          return {
            make: Query.make,
            $$do
          };
        };
        return {
          connection,
          connect,
          MakeModel,
          MakeQuery
        };
      }
      exports.MakeDatabase = MakeDatabase;
    }
  });

  // lib/js/src/examples/index.js
  var require_examples = __commonJS({
    "lib/js/src/examples/index.js"(exports) {
      "use strict";
      var IDB = require_IDB();
      var Curry = require_curry();
      var Qunit = require_qunit();
      var Js_math = require_js_math();
      var Belt_List = require_belt_List();
      var ReIndexed = require_ReIndexed();
      var Belt_Array = require_belt_Array();
      var uuid4 = function() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
      };
      function discard(param) {
      }
      function chooseFrom(choices) {
        return choices[Js_math.random_int(0, choices.length)];
      }
      function $$then(prim0, prim1) {
        return prim1.then(Curry.__1(prim0));
      }
      function resolve(prim) {
        return Promise.resolve(prim);
      }
      function cascade(_promise, _functions) {
        while (true) {
          var functions = _functions;
          var promise = _promise;
          var $$function = Belt_List.head(functions);
          if ($$function === void 0) {
            return;
          }
          var new_promise = promise.then(Curry.__1($$function));
          var remaining_functions = Belt_List.tail(functions);
          if (remaining_functions === void 0) {
            return;
          }
          _functions = remaining_functions;
          _promise = new_promise;
          continue;
        }
        ;
      }
      function migrations(param) {
        return [
          function(db, _transaction) {
            var store = Curry._2(IDB.Migration.Database.createObjectStore, db, "vessels");
            store.createIndex("name", "name");
            store.createIndex("age", "age");
          },
          function(db, _transaction) {
            var store = Curry._2(IDB.Migration.Database.createObjectStore, db, "crew");
            store.createIndex("name", "name");
            store.createIndex("age", "age");
          }
        ];
      }
      var DatabaseDef = {
        migrations
      };
      var Database = ReIndexed.MakeDatabase(DatabaseDef);
      var VesselDef = {
        table: "vessels"
      };
      var Vessel = Curry._1(Database.MakeModel, VesselDef);
      function make(param) {
        return {
          vessels: []
        };
      }
      function makeResponse(param) {
        return {
          vessels: []
        };
      }
      var QueryDef_connection = Database.connection;
      var QueryDef = {
        connection: QueryDef_connection,
        make,
        makeResponse
      };
      var Query = Curry._1(Database.MakeQuery, QueryDef);
      var __x = Curry._1(Database.connect, "test_database");
      __x.then(function(_db) {
        var vessels = [
          {
            id: "a",
            name: "MS Anag",
            age: 10
          },
          {
            id: "b",
            name: "MS Anag",
            age: 15
          },
          {
            id: "c",
            name: "MS Fresco",
            age: 5
          },
          {
            id: "d",
            name: "Mc Donald",
            age: 20
          },
          {
            id: "x",
            name: "Mc Donald",
            age: 15
          }
        ];
        Qunit.module("Base", function(hooks) {
          hooks.beforeEach(function(x) {
            var done = x.async();
            return cascade(Curry._1(Query.$$do, {
              vessels: Belt_Array.concat(["clear"], Belt_Array.map(vessels, function(v) {
                return {
                  NAME: "save",
                  VAL: v
                };
              }))
            }), {
              hd: function(results) {
                Curry._1(done, void 0);
                return Promise.resolve(results);
              },
              tl: 0
            });
          });
          Qunit.test("Can read all the stored vessels", function(x) {
            var done = x.async();
            var __x2 = Curry._1(Query.$$do, {
              vessels: [{
                NAME: "query",
                VAL: "all"
              }]
            });
            __x2.then(function(results) {
              x.equal(results.vessels.length, 5, "There should be 5 vessels");
              x.deepEqual(results.vessels, vessels, "The vessels match the stored vessels");
              return Promise.resolve(Curry._1(done, void 0));
            });
          });
          Qunit.test("Can delete all stored vessels at once", function(x) {
            var done = x.async(2);
            return cascade(Curry._1(Query.$$do, {
              vessels: [{
                NAME: "query",
                VAL: "all"
              }]
            }), {
              hd: function(results) {
                x.equal(results.vessels.length, 5, "There should be 5 vessels");
                Curry._1(done, void 0);
                return Curry._1(Query.$$do, {
                  vessels: [
                    "clear",
                    {
                      NAME: "query",
                      VAL: "all"
                    }
                  ]
                });
              },
              tl: {
                hd: function(results) {
                  x.equal(results.vessels.length, 0, "There most be no vessels stored after 'clear'");
                  Curry._1(done, void 0);
                  return Promise.resolve(results);
                },
                tl: 0
              }
            });
          });
          Qunit.test("Can delete a single vessel by key", function(x) {
            var done = x.async();
            var __x2 = Curry._1(Query.$$do, {
              vessels: [
                {
                  NAME: "delete",
                  VAL: "a"
                },
                {
                  NAME: "query",
                  VAL: "all"
                }
              ]
            });
            __x2.then(function(results) {
              x.equal(results.vessels.length, 4, "There should be just 4 vessels");
              x.false(Belt_Array.some(results.vessels, function(vessel) {
                return vessel.id === "a";
              }), "Non of the vessel has 'a' as id");
              Curry._1(done, void 0);
              return Promise.resolve(void 0);
            });
          });
          Qunit.test("Can retrieve a single vessel by key", function(x) {
            var done = x.async();
            var __x2 = Curry._1(Query.$$do, {
              vessels: [{
                NAME: "get",
                VAL: "a"
              }]
            });
            __x2.then(function(results) {
              x.equal(results.vessels.length, 1, "There should be just 1 vessels");
              x.deepEqual(Belt_Array.get(results.vessels, 0), {
                id: "a",
                name: "MS Anag",
                age: 10
              }, "The vessel retrieved should have id 'a'");
              Curry._1(done, void 0);
              return Promise.resolve(void 0);
            });
          });
          Qunit.test("Can add a new vessel", function(x) {
            var done = x.async();
            var __x2 = Curry._1(Query.$$do, {
              vessels: [
                {
                  NAME: "save",
                  VAL: {
                    id: "new",
                    name: "MS New",
                    age: 30
                  }
                },
                {
                  NAME: "query",
                  VAL: "all"
                }
              ]
            });
            __x2.then(function(results) {
              x.equal(results.vessels.length, 6, "There should be just 6 vessels");
              x.deepEqual(Belt_Array.keep(results.vessels, function(vessel) {
                return vessel.id === "new";
              }), [{
                id: "new",
                name: "MS New",
                age: 30
              }], "The new vessel can be retrieved");
              Curry._1(done, void 0);
              return Promise.resolve(void 0);
            });
          });
          var checkResultantKeys = function(x, query2, keys) {
            var done = x.async();
            var __x2 = Curry._1(Query.$$do, {
              vessels: [query2]
            });
            __x2.then(function(results) {
              var retrievedKeys = Belt_Array.map(results.vessels, function(vessel) {
                return vessel.id;
              });
              x.deepEqual(retrievedKeys, keys, "Retrieved should keys match");
              Curry._1(done, void 0);
              return Promise.resolve(void 0);
            });
          };
          Qunit.module("Test term on primary key", function(param) {
            Qunit.test("Can get pricese primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "is",
                  VAL: [
                    "id",
                    "c"
                  ]
                }
              }, ["c"]);
            });
            Qunit.test("Can get less than primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "lt",
                  VAL: [
                    "id",
                    "c"
                  ]
                }
              }, [
                "a",
                "b"
              ]);
            });
            Qunit.test("Can get less or equal than primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "lte",
                  VAL: [
                    "id",
                    "c"
                  ]
                }
              }, [
                "a",
                "b",
                "c"
              ]);
            });
            Qunit.test("Can get grater than primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "gt",
                  VAL: [
                    "id",
                    "c"
                  ]
                }
              }, [
                "d",
                "x"
              ]);
            });
            Qunit.test("Can get grater or equal than primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "gte",
                  VAL: [
                    "id",
                    "c"
                  ]
                }
              }, [
                "c",
                "d",
                "x"
              ]);
            });
            Qunit.test("Can get a range with exclusive of keys", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "between",
                  VAL: [
                    "id",
                    {
                      NAME: "excl",
                      VAL: "b"
                    },
                    {
                      NAME: "excl",
                      VAL: "d"
                    }
                  ]
                }
              }, ["c"]);
            });
            Qunit.test("Can get a range left exclusive and right inclusive keys", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "between",
                  VAL: [
                    "id",
                    {
                      NAME: "excl",
                      VAL: "b"
                    },
                    {
                      NAME: "incl",
                      VAL: "d"
                    }
                  ]
                }
              }, [
                "c",
                "d"
              ]);
            });
            Qunit.test("Can get a range left inclusive and right exclusive keys", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "between",
                  VAL: [
                    "id",
                    {
                      NAME: "incl",
                      VAL: "b"
                    },
                    {
                      NAME: "excl",
                      VAL: "d"
                    }
                  ]
                }
              }, [
                "b",
                "c"
              ]);
            });
            Qunit.test("Can get a range of incluisive keys", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "between",
                  VAL: [
                    "id",
                    {
                      NAME: "incl",
                      VAL: "b"
                    },
                    {
                      NAME: "incl",
                      VAL: "d"
                    }
                  ]
                }
              }, [
                "b",
                "c",
                "d"
              ]);
            });
          });
          Qunit.module("Test term on an index", function(param) {
            Qunit.test("Can get pricese primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "is",
                  VAL: [
                    "age",
                    15
                  ]
                }
              }, [
                "b",
                "x"
              ]);
            });
            Qunit.test("Can get less than primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "lt",
                  VAL: [
                    "age",
                    15
                  ]
                }
              }, [
                "c",
                "a"
              ]);
            });
            Qunit.test("Can get less or equal than primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "lte",
                  VAL: [
                    "age",
                    15
                  ]
                }
              }, [
                "c",
                "a",
                "b",
                "x"
              ]);
            });
            Qunit.test("Can get grater than primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "gt",
                  VAL: [
                    "age",
                    15
                  ]
                }
              }, ["d"]);
            });
            Qunit.test("Can get grater or equal than primary key", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "gte",
                  VAL: [
                    "age",
                    15
                  ]
                }
              }, [
                "b",
                "x",
                "d"
              ]);
            });
            Qunit.test("Can get a range with exclusive of keys", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "between",
                  VAL: [
                    "age",
                    {
                      NAME: "excl",
                      VAL: 5
                    },
                    {
                      NAME: "excl",
                      VAL: 20
                    }
                  ]
                }
              }, [
                "a",
                "b",
                "x"
              ]);
            });
            Qunit.test("Can get a range left exclusive and right inclusive keys", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "between",
                  VAL: [
                    "age",
                    {
                      NAME: "excl",
                      VAL: 5
                    },
                    {
                      NAME: "incl",
                      VAL: 20
                    }
                  ]
                }
              }, [
                "a",
                "b",
                "x",
                "d"
              ]);
            });
            Qunit.test("Can get a range left inclusive and right exclusive keys", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "between",
                  VAL: [
                    "age",
                    {
                      NAME: "incl",
                      VAL: 5
                    },
                    {
                      NAME: "excl",
                      VAL: 20
                    }
                  ]
                }
              }, [
                "c",
                "a",
                "b",
                "x"
              ]);
            });
            Qunit.test("Can get a range of incluisive keys", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "between",
                  VAL: [
                    "age",
                    {
                      NAME: "incl",
                      VAL: 5
                    },
                    {
                      NAME: "incl",
                      VAL: 20
                    }
                  ]
                }
              }, [
                "c",
                "a",
                "b",
                "x",
                "d"
              ]);
            });
          });
          Qunit.module("Test filtering", function(param) {
            Qunit.test("Filtering over all items", function(x) {
              return checkResultantKeys(x, {
                NAME: "filter",
                VAL: [
                  "all",
                  function(vessel) {
                    return vessel.age === 15;
                  }
                ]
              }, [
                "b",
                "x"
              ]);
            });
            Qunit.test("Filtering over previous selector items", function(x) {
              return checkResultantKeys(x, {
                NAME: "filter",
                VAL: [
                  {
                    NAME: "is",
                    VAL: [
                      "name",
                      "MS Anag"
                    ]
                  },
                  function(vessel) {
                    return vessel.age === 15;
                  }
                ]
              }, ["b"]);
            });
          });
          Qunit.module("AND logic operator", function(param) {
            Qunit.test("Two queries over the same value result in empty", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "And",
                  VAL: [
                    {
                      NAME: "is",
                      VAL: [
                        "name",
                        "MS Anag"
                      ]
                    },
                    {
                      NAME: "is",
                      VAL: [
                        "name",
                        "MS Donald"
                      ]
                    }
                  ]
                }
              }, []);
            });
            Qunit.test("Two where one reduces the other one", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "And",
                  VAL: [
                    {
                      NAME: "is",
                      VAL: [
                        "name",
                        "MS Anag"
                      ]
                    },
                    {
                      NAME: "is",
                      VAL: [
                        "age",
                        15
                      ]
                    }
                  ]
                }
              }, ["b"]);
            });
          });
          Qunit.module("OR logic operator", function(param) {
            Qunit.test("Two queries on oposite directions exclude the center", function(x) {
              return checkResultantKeys(x, {
                NAME: "query",
                VAL: {
                  NAME: "Or",
                  VAL: [
                    {
                      NAME: "lt",
                      VAL: [
                        "age",
                        15
                      ]
                    },
                    {
                      NAME: "gt",
                      VAL: [
                        "age",
                        15
                      ]
                    }
                  ]
                }
              }, [
                "d",
                "c",
                "a"
              ]);
            });
          });
          Qunit.module("Conditional update", function(param) {
            Qunit.test("If the predicate returns None nothing is updated", function(x) {
              var query2 = {
                NAME: "updateWhen",
                VAL: [
                  "all",
                  function(_vessel) {
                  }
                ]
              };
              var expected = [
                {
                  id: "a",
                  name: "MS Anag",
                  age: 10
                },
                {
                  id: "b",
                  name: "MS Anag",
                  age: 15
                },
                {
                  id: "c",
                  name: "MS Fresco",
                  age: 5
                },
                {
                  id: "d",
                  name: "Mc Donald",
                  age: 20
                },
                {
                  id: "x",
                  name: "Mc Donald",
                  age: 15
                }
              ];
              var done = x.async();
              var __x2 = Curry._1(Query.$$do, {
                vessels: [
                  query2,
                  {
                    NAME: "query",
                    VAL: "all"
                  }
                ]
              });
              __x2.then(function(results) {
                x.deepEqual(results.vessels, expected, "Should match the remaining objects");
                Curry._1(done, void 0);
                return Promise.resolve(void 0);
              });
            });
            Qunit.test("If the the predicate returns Some(vessel) it is modified", function(x) {
              var done = x.async(2);
              return cascade(Curry._1(Query.$$do, {
                vessels: [{
                  NAME: "updateWhen",
                  VAL: [
                    "all",
                    function(vessel) {
                      if (vessel.name === "MS Anag") {
                        return {
                          id: vessel.id,
                          name: vessel.name,
                          age: 0
                        };
                      }
                    }
                  ]
                }]
              }), {
                hd: function(param2) {
                  Curry._1(done, void 0);
                  return Curry._1(Query.$$do, {
                    vessels: [{
                      NAME: "query",
                      VAL: "all"
                    }]
                  });
                },
                tl: {
                  hd: function(results) {
                    x.deepEqual(results.vessels, [
                      {
                        id: "a",
                        name: "MS Anag",
                        age: 0
                      },
                      {
                        id: "b",
                        name: "MS Anag",
                        age: 0
                      },
                      {
                        id: "c",
                        name: "MS Fresco",
                        age: 5
                      },
                      {
                        id: "d",
                        name: "Mc Donald",
                        age: 20
                      },
                      {
                        id: "x",
                        name: "Mc Donald",
                        age: 15
                      }
                    ], "Vessels with name `MS Anag` shuold have age=0");
                    Curry._1(done, void 0);
                    return Promise.resolve(results);
                  },
                  tl: 0
                }
              });
            });
          });
          Qunit.module("Conditional deletion", function(param) {
            Qunit.test("Deleting the ones with `age = 15` should left the rest intact", function(x) {
              var done = x.async(2);
              return cascade(Curry._1(Query.$$do, {
                vessels: [{
                  NAME: "deleteWhen",
                  VAL: {
                    NAME: "is",
                    VAL: [
                      "age",
                      15
                    ]
                  }
                }]
              }), {
                hd: function(param2) {
                  Curry._1(done, void 0);
                  return Curry._1(Query.$$do, {
                    vessels: [{
                      NAME: "query",
                      VAL: "all"
                    }]
                  });
                },
                tl: {
                  hd: function(results) {
                    x.deepEqual(results.vessels, [
                      {
                        id: "a",
                        name: "MS Anag",
                        age: 10
                      },
                      {
                        id: "c",
                        name: "MS Fresco",
                        age: 5
                      },
                      {
                        id: "d",
                        name: "Mc Donald",
                        age: 20
                      }
                    ], "The ones with age!=15 should remain");
                    Curry._1(done, void 0);
                    return Promise.resolve(results);
                  },
                  tl: 0
                }
              });
            });
          });
        });
        Qunit.module("Performance test", function(param) {
          Qunit.test("Bulk insert of 10.000 items", function(x) {
            var names = [
              "MS Angst",
              "MS Angust",
              "Cachimba",
              "Record MSX",
              "VAX",
              "UNIVAC"
            ];
            var vessels2 = Belt_Array.makeBy(1e4, function(param2) {
              return {
                id: Curry._1(uuid4, void 0),
                name: chooseFrom(names),
                age: Js_math.random_int(0, 100)
              };
            });
            var done = x.async(3);
            var start = Date.now() | 0;
            var __x2 = Curry._1(Query.$$do, {
              vessels: Belt_Array.map(vessels2, function(v) {
                return {
                  NAME: "save",
                  VAL: v
                };
              })
            });
            __x2.then(function(param2) {
              var afterInsert = Date.now() | 0;
              x.true(true, "Insertion done in " + String(afterInsert - start | 0) + "ms");
              var __x3 = Curry._1(Query.$$do, {
                vessels: [{
                  NAME: "query",
                  VAL: "all"
                }]
              });
              __x3.then(function(param3) {
                var afterReadAll = Date.now() | 0;
                x.true(true, "Read all done in " + String(afterReadAll - afterInsert | 0) + "ms");
                var __x4 = Curry._1(Query.$$do, {
                  vessels: [{
                    NAME: "query",
                    VAL: {
                      NAME: "is",
                      VAL: [
                        "name",
                        "Cachimba"
                      ]
                    }
                  }]
                });
                __x4.then(function(param4) {
                  var readFromIndex = Date.now() | 0;
                  x.true(true, "Read from single index in " + String(readFromIndex - afterReadAll | 0) + "ms");
                  Curry._1(done, void 0);
                  return Promise.resolve(void 0);
                });
                Curry._1(done, void 0);
                return Promise.resolve(void 0);
              });
              Curry._1(done, void 0);
              return Promise.resolve(void 0);
            });
          });
        });
        return Promise.resolve(void 0);
      });
      exports.uuid4 = uuid4;
      exports.discard = discard;
      exports.chooseFrom = chooseFrom;
      exports.$$then = $$then;
      exports.resolve = resolve;
      exports.cascade = cascade;
      exports.DatabaseDef = DatabaseDef;
      exports.Database = Database;
      exports.VesselDef = VesselDef;
      exports.Vessel = Vessel;
      exports.QueryDef = QueryDef;
      exports.Query = Query;
    }
  });
  require_examples();
})();
/*!
 * QUnit 2.16.0
 * https://qunitjs.com/
 *
 * Copyright OpenJS Foundation and other contributors
 * Released under the MIT license
 * https://jquery.org/license
 */

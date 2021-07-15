
/**
 * Runs the request inside the transaction of the database
 * @param db {IDBDatabase}
*/

function transaction(db, requests) {
    let response = {};
    Object.keys(requests).map((storeName) => response[storeName] = []);
    let storeCommands = Object.entries(requests).map((storeCommand) => {
        let [storeName, commands] = storeCommand;

        // transfer plain commands like #all and #clear into the shape of the
        // rest of commands with arguments
        commands = commands.map((command) => {
            return typeof command === "string" ? { NAME: command } : command
        })
        return { storeName, commands }
    });

    return new Promise((resolve) => {
        let transaction = db.transaction(
            getTransactionStores(storeCommands),
            getTransactionMode(storeCommands)
        );
        transaction.oncomplete = () => resolve(response);
        storeCommands.forEach(({ storeName, commands }) => {
            let store = transaction.objectStore(storeName);
            commands.map(({ NAME, VAL }) => {
                switch (NAME) {
                    case "get":
                        let request = store.get(VAL);
                        request.onsuccess = () => {
                            if (!isUndefined(request.result))
                                response[store.name].push(request.result);
                        }
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
                    case "query":
                        query(store, VAL, (results) => {
                            response[store.name].push(...results)
                        });
                        break;
                    case "updateWhen": {
                        let [expression, transformation] = VAL;
                        query(store, expression, (results) =>
                            results
                                .map(transformation)
                                .filter((item) => !isUndefined(item))
                                .forEach((item) => store.put(item))
                        );
                        break;
                    }
                    case "deleteWhen": {
                        query(store, VAL, (results) => {
                            results.forEach(({ id }) => store.delete(id));
                        });
                        break;
                    }
                    default:
                        throw Error(`I don't know this command ${NAME}`)
                }
            });
        });
    });
}



function getTransactionStores(storeCommands) {
    return storeCommands
        .filter(({ commands }) => commands.length)
        .map(({ storeName }) => storeName);
}

const transactionWriteOps = new Set(["save", "delete", "updateWhen", "deleteWhen", "clear"]);

function getTransactionMode(storeCommand) {
    const isWriteTransaction = storeCommand
        .some(({ commands }) => commands.some(({ NAME }) => transactionWriteOps.has(NAME)));
    return isWriteTransaction ? "readwrite" : "readonly";
}


const simpleQueries = new Set([
    "all",
    "is",
    "lt",
    "lte",
    "gt",
    "gte",
    "between",
]);

/**
 * Run complicated queries inside the a transaction
 * @param store {IDBObjectStore}
 * @param callback {(items: Array) => void}
*/

function query(store, expression, callback) {
    let { NAME, VAL } = expression;
    if (typeof expression === "string") {
        NAME = expression;
        VAL = [];
    }
    if (simpleQueries.has(NAME)) {
        let results = []
        let gather = (cursor) => {
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                callback(results);
            }
        }
        return simpleQuery(store, { NAME, VAL }, gather);
    } else if (NAME === "And") {
        let [left, right] = VAL
        let resultCounter = {};
        let results = {};
        let awaiting = 2;
        let gather = (items) => {
            items.forEach((item) => {
                resultCounter[item.id] = (resultCounter[item.id] || 0) + 1;
                results[item.id] = item;
            })
            awaiting -= 1;
            if (awaiting === 0) {
                let finalResults = []
                for (const [id, counter] of Object.entries(resultCounter)) {
                    if (counter === 2) {
                        finalResults.push(results[id]);
                    }
                }
                callback(finalResults);
            }
        };
        query(store, left, gather);
        query(store, right, gather);
    } else if (NAME === "Or") {
        let [left, right] = VAL
        let results = {}
        let awaiting = 2;
        let gather = (items) => {
            items.forEach((item) => { results[item.id] = item })
            awaiting -= 1;
            if (awaiting === 0) {
                callback(Object.values(results));
            }
        };
        query(store, left, gather);
        query(store, right, gather);
    }
}

/**
 * Runs the low level queries over an index
 * @param store {IDBObjectStore}
 * @param callback {(cursor: IDBCursor) => void}
*/

function simpleQuery(store, { NAME, VAL }, callback) {
    let [attribute, ...values] = VAL;

    let range = (() => {
        switch (NAME) {
            case "all":
                return undefined;
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
                return IDBKeyRange.bound(
                    lower.VAL,
                    upper.VAL,
                    lower.NAME === "excl",
                    upper.NAME === "excl"
                );

        }
    })();
    openCursor(store, attribute, range).onsuccess = (event) => {
        let cursor = event.target.result;
        callback(cursor);
    }
}

/**
 * Request to open a cursor on an index on a store
 * @param {IDBObjectStore} store
 * @param {string} attribute
 * @param {IDBKeyRange} range
 * @returns {IDBRequest}
 */
function openCursor(store, attribute, range) {
    let index = isUndefined(attribute) || attribute == store.keyPath ?
        store : store.index(attribute);
    return index.openCursor(range);
}


function isUndefined(value) { return typeof value === "undefined" }


export default transaction

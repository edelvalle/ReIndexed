
/**
 * Runs the request inside the transaction of the database
 * @param db {IDBDatabase}
 * @param request {object}
*/

function transaction(db, requests) {
    let response = {};
    Object.keys(requests).map((storeName) => response[storeName] = []);
    let storeCommands = Object.entries(requests).map((storeCommand) => {
        let [storeName, commands] = storeCommand;
        return { storeName, commands }
    });
    return new Promise((resolve) => {
        let transaction = db.transaction(_getTransactionStores(storeCommands), _getTransactionMode(requests));
        transaction.oncomplete = () => resolve(response);
        storeCommands.forEach(({ storeName, commands }) => {
            console.log(storeName);
            let store = transaction.objectStore(storeName);
            commands.map(({ NAME, VAL }) => {
                switch (NAME) {
                    case "get":
                        let request = store.get(VAL);
                        request.onsuccess = () => {
                            if (!_isUndefined(request.result))
                                response[storeName].push(request.result);
                        }
                        break;
                    case "save":
                        store.put(VAL);
                        break;
                    case "delete":
                        store.delete(VAL);
                        break;
                }
            });
        });
    });
}

function _getTransactionStores(storeCommands) {
    return storeCommands
        .filter(({ commands }) => commands.length)
        .map(({ storeName }) => storeName);
}

const _transactionWriteOps = new Set(["save", "delete", "updateQuery", "deleteQuery"]);

function _getTransactionMode(requests) {
    const isWriteTransaction = Object
        .values(requests)
        .some((commands) => commands.some(({ NAME }) => _transactionWriteOps.has(NAME)));
    return isWriteTransaction ? "readwrite" : "readonly";
}

function _isUndefined(value) { return typeof value === "undefined" }


export default transaction

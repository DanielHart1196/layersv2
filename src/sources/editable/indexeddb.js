const DATABASE_NAME = "layerv2-editable";
const DATABASE_VERSION = 1;
const STORE_NAME = "collections";
const PRIMARY_KEY = "user-overlays";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed."));
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

async function loadStoredCollection() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(PRIMARY_KEY);

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB read failed."));
    };

    request.onsuccess = () => {
      resolve(request.result ?? null);
    };
  });
}

async function saveStoredCollection(collection) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(collection);

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB write failed."));
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    };
  });
}

export { PRIMARY_KEY, loadStoredCollection, saveStoredCollection };

/**
 * IndexedDB schema v1 for reader-world EventStore.
 * Fail-closed: no localStorage / memory fallback.
 */

export const READER_WORLD_IDB_NAME = "reader_world_event_store_v1";
export const READER_WORLD_IDB_VERSION = 1;

export const STORE_EVENTS = "events";
export const STORE_RECEIPTS = "receipts";
export const STORE_PROJECTION_READING = "projection_reading";
export const STORE_PROJECTION_WORLD = "projection_world";
export const STORE_PROJECTION_CHECKPOINTS = "projection_checkpoints";
export const STORE_PROJECTION_APPLIED = "projection_applied";

export const INDEX_BY_MESSAGE_ID = "by_message_id";
export const INDEX_BY_EXPERIENCE = "by_experience";

export const ALL_STORES = [
  STORE_EVENTS,
  STORE_RECEIPTS,
  STORE_PROJECTION_READING,
  STORE_PROJECTION_WORLD,
  STORE_PROJECTION_CHECKPOINTS,
  STORE_PROJECTION_APPLIED,
] as const;

export const PROJECTION_STORES = [
  STORE_PROJECTION_READING,
  STORE_PROJECTION_WORLD,
  STORE_PROJECTION_CHECKPOINTS,
  STORE_PROJECTION_APPLIED,
] as const;

function upgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const events = db.createObjectStore(STORE_EVENTS, {
      keyPath: ["experience_id", "stream_version"],
    });
    events.createIndex(INDEX_BY_MESSAGE_ID, "message_id", { unique: true });
    events.createIndex(INDEX_BY_EXPERIENCE, "experience_id", { unique: false });

    db.createObjectStore(STORE_RECEIPTS, {
      keyPath: ["principal_id", "experience_id", "idempotency_key"],
    });

    db.createObjectStore(STORE_PROJECTION_READING, {
      keyPath: "experience_id",
    });
    db.createObjectStore(STORE_PROJECTION_WORLD, {
      keyPath: "experience_id",
    });
    db.createObjectStore(STORE_PROJECTION_CHECKPOINTS, {
      keyPath: ["projector_name", "experience_id"],
    });
    db.createObjectStore(STORE_PROJECTION_APPLIED, {
      keyPath: ["projector_name", "event_id"],
    });
  }
}

/** Open the reader-world EventStore database (creates stores on first open). */
export function openDatabase(
  name: string = READER_WORLD_IDB_NAME,
  version: number = READER_WORLD_IDB_VERSION,
): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is unavailable in this environment"),
    );
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, version);
    } catch (err) {
      reject(err);
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;
      upgrade(db, event.oldVersion);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed"));
    };

    request.onblocked = () => {
      reject(new Error("IndexedDB open blocked (close other tabs)"));
    };
  });
}

/** Delete the entire database (test cleanup only). */
export function deleteReaderWorldDatabase(
  name: string = READER_WORLD_IDB_NAME,
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is unavailable in this environment"),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB deleteDatabase failed"));
    };
    request.onblocked = () => {
      // Still resolve after a tick — blocked often means lingering connections.
      // Callers should close db handles first.
      reject(new Error("IndexedDB deleteDatabase blocked"));
    };
  });
}

/** Wrap an IDBRequest as a Promise (safe to await inside the same transaction). */
export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

/** Wait for transaction complete / error / abort. */
export function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      reject(tx.error ?? new Error("IndexedDB transaction error"));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    };
  });
}

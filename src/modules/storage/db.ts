import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface FTPSDB extends DBSchema {
    identity: {
        key: string
        value: {
            id: string
            encryptedKeypair: Uint8Array
            salt: Uint8Array
            displayName?: string
        }
    }
}

export const DB_NAME = 'ftps_db'
export const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<FTPSDB>> | null = null

export function getDB() {
    if (!dbPromise) {
        dbPromise = openDB<FTPSDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                db.createObjectStore('identity', { keyPath: 'id' })
            },
        })
    }
    return dbPromise
}

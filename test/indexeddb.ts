import 'fake-indexeddb/auto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FDBFactory: { new(): IDBFactory } = require('fake-indexeddb/lib/FDBFactory');

export function resetIndexedDB() {
    globalThis.indexedDB = new FDBFactory();
}

import { apiKey, AI_PROVIDERS } from '../../core/ai.js';
const encoder = new TextEncoder();
const aad = provider => encoder.encode('Cosmic PDF API key v1:' + provider);
export function indexedVaultRepository() {
  let database;
  function open() {
    database ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('cosmic-pdf-api-vault', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(request.error); };
    });
    return database;
  }
  return {
    async get(name) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db.transaction('keys').objectStore('keys').get(name);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    },
    async set(name, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').put(value, name);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    },
    async clear() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').clear();
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    },
    async remove(name) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').delete(name);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    }
  };
}
export function createApiVault(repository = indexedVaultRepository()) {
  let queue = Promise.resolve();
  const serialize = task => { const job = queue.catch(() => {}).then(task); queue = job; return job; };
  const check = provider => { if (!Object.hasOwn(AI_PROVIDERS, provider)) throw Error('invalidRequest'); };
  async function rootKey() {
    let key = await repository.get('root');
    if (!key) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
      await repository.set('root', key);
    }
    return key;
  }
  return Object.freeze({
    status: () => serialize(async () => {
      const result = {};
      for (const provider of Object.keys(AI_PROVIDERS)) result[provider] = !!await repository.get(provider);
      return result;
    }),
    save: (provider, value) => serialize(async () => {
      check(provider); const secret = apiKey(value), iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(provider) }, await rootKey(), encoder.encode(secret));
      await repository.set(provider, { version: 1, iv, encrypted });
    }),
    read: provider => serialize(async () => {
      check(provider); const record = await repository.get(provider);
      if (!record) throw Error('keyMissing');
      const key = await repository.get('root');
      if (!key || record.version !== 1 || !(record.iv instanceof Uint8Array) || record.iv.length !== 12) throw Error('keyMissing');
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: aad(provider) }, key, record.encrypted));
    }),
    remove: provider => serialize(async () => {
      check(provider); await repository.remove(provider);
      if(!(await Promise.all(Object.keys(AI_PROVIDERS).map(name=>repository.get(name)))).some(Boolean))await repository.clear();
    }),
    clear: () => serialize(() => repository.clear())
  });
}

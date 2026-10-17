// Minimaler Key-Value-Speicher auf IndexedDB (für Fotos, die für localStorage zu groß sind).

let dbp;
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('tafel', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('kv', mode);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}

export const idbGet = (k) => tx('readonly', (s) => s.get(k)).catch(() => undefined);
export const idbSet = (k, v) => tx('readwrite', (s) => s.put(v, k)).catch(() => undefined);
export const idbDel = (k) => tx('readwrite', (s) => s.delete(k)).catch(() => undefined);

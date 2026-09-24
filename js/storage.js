/**
 * Morning Submission Buddy - High Capacity Storage System (IndexedDB + LocalStorage)
 * 画像ファイルサイズ無制限・大量キャラクター永続保存用ストレージ
 */

class AppStorage {
  constructor() {
    this.dbName = 'MorningSubmissionAppDB';
    this.storeName = 'app_key_value_store';
    this.dbPromise = this.initDB();
  }

  initDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to localStorage');
        resolve(null);
        return;
      }

      const req = indexedDB.open(this.dbName, 1);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      req.onsuccess = (e) => {
        resolve(e.target.result);
      };

      req.onerror = (e) => {
        console.warn('IndexedDB open error:', e);
        resolve(null);
      };
    });
  }

  async setItem(key, value) {
    try {
      // 1. IndexedDB に保存 (容量制限なし・大容量画像OK)
      const db = await this.dbPromise;
      if (db) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          const req = store.put(value, key);
          req.onsuccess = () => resolve(true);
          req.onerror = (err) => reject(err);
        });
      }

      // 2. LocalStorage にも可能な限り同期バックアップ
      try {
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, str);
      } catch (lsErr) {
        // LocalStorageの5MB制限を超えた場合はIndexedDBのみで維持
        console.info('LocalStorage quota exceeded; saved safely in IndexedDB.');
      }
      return true;
    } catch (e) {
      console.error('AppStorage setItem error:', e);
      return false;
    }
  }

  async getItem(key) {
    try {
      const db = await this.dbPromise;
      if (db) {
        const result = await new Promise((resolve) => {
          const tx = db.transaction(this.storeName, 'readonly');
          const store = tx.objectStore(this.storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (result !== undefined && result !== null) {
          return result;
        }
      }

      // IndexedDB に無ければ LocalStorage から取得
      const lsVal = localStorage.getItem(key);
      if (lsVal) {
        try {
          return JSON.parse(lsVal);
        } catch {
          return lsVal;
        }
      }
      return null;
    } catch (e) {
      console.warn('AppStorage getItem error:', e);
      const lsVal = localStorage.getItem(key);
      try { return JSON.parse(lsVal); } catch { return lsVal; }
    }
  }

  async removeItem(key) {
    try {
      const db = await this.dbPromise;
      if (db) {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.delete(key);
      }
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('AppStorage removeItem error:', e);
      return false;
    }
  }
}

window.appStorage = new AppStorage();

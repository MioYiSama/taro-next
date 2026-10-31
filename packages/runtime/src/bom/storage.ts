/** `Storage` backed by `wx.*StorageSync` (`localStorage`) or memory (`sessionStorage`). */
export interface StorageBackend {
  keys(): string[];
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  clear(): void;
}

export class Storage {
  /** @internal */ $backend: StorageBackend;

  constructor(backend: StorageBackend) {
    this.$backend = backend;
  }

  get length(): number {
    return this.$backend.keys().length;
  }

  key(index: number): string | null {
    return this.$backend.keys()[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.$backend.get(String(key));
  }

  setItem(key: string, value: string): void {
    this.$backend.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.$backend.remove(String(key));
  }

  clear(): void {
    this.$backend.clear();
  }
}

export function memoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
    clear: () => map.clear(),
  };
}

export function wxBackend(): StorageBackend {
  return {
    keys: () => wx.getStorageInfoSync().keys,
    get: (key) => {
      const value: unknown = wx.getStorageSync(key);
      // A missing key reads as "", tell it apart from a stored empty string.
      if (value === "" && !wx.getStorageInfoSync().keys.includes(key)) return null;
      return String(value);
    },
    set: (key, value) => wx.setStorageSync(key, value),
    remove: (key) => wx.removeStorageSync(key),
    clear: () => wx.clearStorageSync(),
  };
}

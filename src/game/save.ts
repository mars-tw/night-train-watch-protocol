import type { RunState, SettingsState } from "./types";

const DB_NAME = "night-train-save";
const STORE_NAME = "snapshots";
const CURRENT_KEY = "run.current";
const BACKUP_KEY = "run.backup";
const SETTINGS_KEY = "settings";

function parseRun(raw: string | null): RunState | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as RunState;
  if (value.schemaVersion !== 1 || !value.seed || !value.resources || !value.survivor) throw new Error("Invalid save schema");
  return value;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open save database"));
  });
}

async function idbWrite(key: string, value: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Cannot write save"));
  });
  database.close();
}

async function idbRead(key: string): Promise<string | null> {
  const database = await openDatabase();
  const value = await new Promise<string | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("Cannot read save"));
  });
  database.close();
  return value;
}

export class SaveService {
  public async hasSave(): Promise<boolean> {
    try {
      return Boolean((await idbRead(CURRENT_KEY)) ?? localStorage.getItem(CURRENT_KEY));
    } catch {
      return Boolean(localStorage.getItem(CURRENT_KEY));
    }
  }

  public async save(run: RunState): Promise<void> {
    const serialized = JSON.stringify(run);
    const previous = localStorage.getItem(CURRENT_KEY);
    if (previous) localStorage.setItem(BACKUP_KEY, previous);
    localStorage.setItem(CURRENT_KEY, serialized);
    try {
      const idbCurrent = await idbRead(CURRENT_KEY);
      if (idbCurrent) await idbWrite(BACKUP_KEY, idbCurrent);
      await idbWrite(CURRENT_KEY, serialized);
    } catch {
      // localStorage remains the deterministic offline fallback.
    }
  }

  public async load(): Promise<{ run: RunState | null; recovered: boolean }> {
    let current: string | null = null;
    let backup: string | null = null;
    try {
      current = (await idbRead(CURRENT_KEY)) ?? localStorage.getItem(CURRENT_KEY);
      backup = (await idbRead(BACKUP_KEY)) ?? localStorage.getItem(BACKUP_KEY);
    } catch {
      current = localStorage.getItem(CURRENT_KEY);
      backup = localStorage.getItem(BACKUP_KEY);
    }
    try {
      return { run: parseRun(current), recovered: false };
    } catch {
      return { run: parseRun(backup), recovered: true };
    }
  }

  public saveSettings(settings: SettingsState): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  public loadSettings(): SettingsState | null {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as SettingsState | null;
    } catch {
      return null;
    }
  }
}

export const saveKeys = { current: CURRENT_KEY, backup: BACKUP_KEY } as const;

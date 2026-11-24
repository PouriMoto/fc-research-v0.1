// Persistent state: localStorage for text, IndexedDB for images.

import { debounce } from './util.js';

const KEY = 'fc-research-v3';
const EMPTY = Object.freeze({ fields: {}, picks: {}, checks: {}, logs: {}, imageCount: 0, updated: 0 });

function blankState() {
  return { version: 3, ui: { theme: 'auto', scale: 1, lastLesson: null, lastStep: {} }, lessons: {} };
}

function readState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object' && raw.lessons) {
      const base = blankState();
      return { ...base, ...raw, ui: { ...base.ui, ...(raw.ui || {}) } };
    }
  } catch { /* fall through */ }
  return blankState();
}

let state = readState();
const listeners = new Set();

const persist = debounce(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    window.dispatchEvent(new CustomEvent('fc:storage-error'));
  }
}, 250);

window.addEventListener('pagehide', () => persist.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist.flush();
});

function ensure(id) {
  if (!state.lessons[id]) state.lessons[id] = { fields: {}, picks: {}, checks: {}, logs: {}, imageCount: 0, updated: 0 };
  return state.lessons[id];
}

function changed(id) {
  if (id) ensure(id).updated = Date.now();
  persist();
  listeners.forEach((fn) => fn());
}

export const store = {
  get ui() { return state.ui; },
  get lessons() { return state.lessons; },
  peek(id) { return state.lessons[id] || EMPTY; },
  has(id) { return Boolean(state.lessons[id]); },

  setField(id, key, value) {
    const lesson = ensure(id);
    if (value === '' || value === undefined) delete lesson.fields[key];
    else lesson.fields[key] = value;
    changed(id);
  },
  setPicks(id, key, list) { ensure(id).picks[key] = list; changed(id); },
  setChecks(id, key, list) { ensure(id).checks[key] = list; changed(id); },
  addLog(id, key, entry) {
    const lesson = ensure(id);
    (lesson.logs[key] ||= []).push({ ...entry, createdAt: Date.now() });
    changed(id);
  },
  removeLog(id, key, index) {
    const list = ensure(id).logs[key] || [];
    list.splice(index, 1);
    changed(id);
  },
  setImageCount(id, n) { ensure(id).imageCount = n; changed(id); },

  setUi(patch) { Object.assign(state.ui, patch); persist(); listeners.forEach((fn) => fn()); },
  rememberStep(id, step) {
    state.ui.lastLesson = id;
    state.ui.lastStep[id] = step;
    persist();
  },

  exportJson() { return JSON.stringify(state, null, 2); },
  importJson(text) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || typeof raw.lessons !== 'object') throw new Error('invalid backup');
    const base = blankState();
    state = { ...base, ...raw, ui: { ...base.ui, ...(raw.ui || {}) } };
    persist.flush();
    listeners.forEach((fn) => fn());
  },
  async wipe() {
    state = blankState();
    persist.flush();
    await images.clearAll();
    listeners.forEach((fn) => fn());
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/* ---------------------------------------------------------------- images */

const DB_NAME = 'fc-research-images';
let dbPromise;

function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
      s.createIndex('lesson', 'lesson');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, run) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('images', mode);
    const result = run(t.objectStore('images'));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

async function shrink(file, maxSide = 1600) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob || file;
  } catch {
    return file;
  }
}

export const images = {
  async add(lesson, file) {
    const blob = await shrink(file);
    await tx('readwrite', (s) => s.add({ lesson, name: file.name, blob, createdAt: Date.now() }));
  },
  async list(lesson) {
    return tx('readonly', (s) => s.index('lesson').getAll(lesson));
  },
  async remove(id) {
    return tx('readwrite', (s) => s.delete(id));
  },
  async clearAll() {
    try { await tx('readwrite', (s) => s.clear()); } catch { /* ignore */ }
  },
};

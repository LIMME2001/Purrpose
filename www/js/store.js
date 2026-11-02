import { defaultState, normalizeState } from './core.js';

const KEY = 'purrpose.v1';
let state = defaultState();
const subs = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage can be unavailable (private mode); the app keeps working in memory */
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = (raw && normalizeState(JSON.parse(raw))) || defaultState();
  } catch {
    state = defaultState();
  }
  return state;
}

export const get = () => state;

/** Replace the state. `silent` saves without re-rendering (used while typing a note). */
export function set(next, { silent = false } = {}) {
  state = next;
  persist();
  if (!silent) subs.forEach((fn) => fn(state));
}

export const update = (fn, opts) => set(fn(state), opts);

export const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export const exportJson = () => JSON.stringify({ app: 'purrpose', exportedAt: new Date().toISOString(), ...state }, null, 2);

/** Returns { ok: true } or { ok: false, error } */
export function importJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That is not valid JSON. Paste the full backup text.' };
  }
  const next = normalizeState(raw);
  if (!next || (!raw.activities && !raw.entries)) {
    return { ok: false, error: 'This does not look like a Purrpose backup.' };
  }
  set(next);
  return { ok: true, entries: next.entries.length };
}

export function resetAll() {
  set(defaultState());
}

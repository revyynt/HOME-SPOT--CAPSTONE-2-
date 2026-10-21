import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.');
}

let persistence = 'local';
const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const authStorage = {
  getItem(key) {
    if (typeof window === 'undefined') return null;
    const preferred = persistence === 'local' ? window.localStorage : window.sessionStorage;
    const alternate = persistence === 'local' ? window.sessionStorage : window.localStorage;
    return preferred.getItem(key) ?? alternate.getItem(key);
  },
  setItem(key, value) {
    if (typeof window === 'undefined') return;
    const preferred = persistence === 'local' ? window.localStorage : window.sessionStorage;
    const alternate = persistence === 'local' ? window.sessionStorage : window.localStorage;
    preferred.setItem(key, value);
    alternate.removeItem(key);
  },
  removeItem(key) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true }
});

export const db = supabase;

const collectionRef = (name) => ({ type: 'collection', name });
const documentRef = (name, id) => ({ type: 'document', name, id });
const where = (field, operator, value) => ({ type: 'where', field, operator, value });
const orderBy = (field, direction = 'asc') => ({ type: 'orderBy', field, direction });
const query = (ref, ...constraints) => ({ type: 'query', ref, constraints });
const serverTimestamp = () => new Date().toISOString();

function dataRef(ref) {
  return ref.type === 'query' ? ref.ref : ref;
}

function constraintsFor(ref) {
  return ref.type === 'query' ? ref.constraints : [];
}

function snapshotRow(row) {
  return {
    id: row.id,
    data: () => row.data
  };
}

function queryRows(ref, rows) {
  const constraints = constraintsFor(ref);
  let result = rows;
  for (const constraint of constraints) {
    if (constraint.type === 'where') {
      result = result.filter((row) => {
        const value = row.data[constraint.field];
        switch (constraint.operator) {
          case '==':
            return value === constraint.value;
          case '!=':
            return value !== constraint.value;
          default:
            throw new Error(`Unsupported Supabase data filter: ${constraint.operator}`);
        }
      });
    } else if (constraint.type === 'orderBy') {
      const direction = constraint.direction === 'desc' ? -1 : 1;
      result = [...result].sort((left, right) => {
        const a = left.data[constraint.field] ?? '';
        const b = right.data[constraint.field] ?? '';
        return a < b ? -direction : a > b ? direction : 0;
      });
    }
  }
  return result;
}

async function fetchDocuments(ref) {
  const target = dataRef(ref);
  let request = supabase.from('app_documents').select('id,data').eq('collection', target.name);
  if (target.type === 'document') request = request.eq('id', target.id);
  for (const constraint of constraintsFor(ref)) {
    if (constraint.type === 'where') {
      const operator = { '==': 'eq', '!=': 'neq' }[constraint.operator];
      if (!operator) {
        throw new Error(`Unsupported Supabase data filter: ${constraint.operator}`);
      }
      request = request.filter(`data->>${constraint.field}`, operator, constraint.value);
    }
  }
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

async function getDoc(ref) {
  const rows = await fetchDocuments(ref);
  const row = rows[0];
  return {
    exists: () => Boolean(row),
    id: row?.id,
    data: () => row?.data
  };
}

async function getDocs(ref) {
  const rows = queryRows(ref, await fetchDocuments(ref));
  const docs = rows.map(snapshotRow);
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    map: (callback) => docs.map(callback),
    forEach: (callback) => docs.forEach(callback)
  };
}

async function setDoc(ref, value, options = {}) {
  let data = value;
  if (options.merge) {
    const existing = await getDoc(ref);
    data = { ...(existing.exists() ? existing.data() : {}), ...value };
  }
  const { error } = await supabase.from('app_documents').upsert(
    {
      collection: ref.name,
      id: ref.id,
      data
    },
    { onConflict: 'collection,id' }
  );
  if (error) throw error;
}

async function addDoc(ref, data) {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('app_documents').insert({
    collection: ref.name,
    id,
    data
  });
  if (error) throw error;
  return documentRef(ref.name, id);
}

async function updateDoc(ref, changes) {
  const existing = await getDoc(ref);
  if (!existing.exists()) throw new Error(`Document ${ref.name}/${ref.id} does not exist.`);
  await setDoc(ref, { ...existing.data(), ...changes });
}

async function deleteDoc(ref) {
  const { error } = await supabase
    .from('app_documents')
    .delete()
    .eq('collection', ref.name)
    .eq('id', ref.id);
  if (error) throw error;
}

function onSnapshot(ref, onData, onError) {
  const target = dataRef(ref);
  let active = true;
  let pending = false;
  let refreshAgain = false;

  const refresh = async () => {
    if (!active) return;
    if (pending) {
      refreshAgain = true;
      return;
    }
    pending = true;
    try {
      if (target.type === 'document') {
        const docSnapshot = await getDoc(target);
        if (active) onData(docSnapshot);
      } else {
        const snapshot = await getDocs(ref);
        if (active) onData(snapshot);
      }
    } catch (error) {
      if (active) onError?.(error);
    } finally {
      pending = false;
      if (active && refreshAgain) {
        refreshAgain = false;
        void refresh();
      }
    }
  };

  // Immediately fetch current state via HTTP REST without waiting for WebSocket handshake
  void refresh();

  const channel = supabase
    .channel(`app-documents:${target.name}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'app_documents',
        filter: `collection=eq.${target.name}`
      },
      refresh
    )
    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') refresh();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(error || new Error(`Supabase Realtime subscription failed: ${status}`));
      }
    });

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

export const supabaseData = {
  collection: (_client, name) => collectionRef(name),
  doc: (_client, name, id) => documentRef(name, id),
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  getDocs,
  serverTimestamp
};

export const authReady = supabase.auth.getSession().then(({ error }) => {
  if (error) throw error;
});

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw error;
  return data.user || null;
}

async function setPersistence(remember) {
  persistence = remember ? 'local' : 'session';
  const selected = persistence === 'local' ? window.localStorage : window.sessionStorage;
  const other = persistence === 'local' ? window.sessionStorage : window.localStorage;
  const existing = other.getItem(authStorageKey);
  if (existing && !selected.getItem(authStorageKey)) selected.setItem(authStorageKey, existing);
  other.removeItem(authStorageKey);
}

async function requireRole(requiredRole, redirectTo) {
  await authReady;
  const user = await getCurrentUser();
  if (!user) {
    window.location.replace(redirectTo || 'login.html');
    return false;
  }

  const role =
    user.app_metadata?.role ||
    (requiredRole === 'tenant' && user.user_metadata?.role === 'tenant' ? 'tenant' : undefined);
  if (role !== requiredRole) {
    console.warn(`[auth] role mismatch: required ${requiredRole}, found ${role || 'none'}`);
    window.location.replace(redirectTo || 'login.html');
    return false;
  }
  return true;
}

export function isDataReady() {
  return true;
}

export function normalizeRoomDocId(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function getRoomDocRef(roomName) {
  return roomName ? documentRef('rooms', normalizeRoomDocId(roomName)) : null;
}

export function getReservationsRef() {
  return collectionRef('reservations');
}

export function getMessagesRef() {
  return collectionRef('messages');
}

export async function ensureRoomDocument(room) {
  if (!room) return null;
  const ref = room.id ? documentRef('rooms', room.id) : getRoomDocRef(room.name);
  if (!ref) return null;
  try {
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      await setDoc(ref, { ...room });
    }
  } catch {
    // Anonymous visitors can read rooms but cannot insert; ignore write failure.
  }
  return ref;
}

export async function waitForSupabaseReady() {
  await authReady;
  return true;
}

export { getCurrentUser, requireRole, setPersistence };

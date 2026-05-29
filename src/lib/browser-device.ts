import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519';

type StoredIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAtMs: number;
};

type StoredDeviceAuthEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

type StoredDeviceAuthStore = {
  version: 1;
  deviceId: string;
  tokens: Record<string, StoredDeviceAuthEntry>;
};

export type BrowserDeviceIdentity = {
  deviceId: string;
  publicKey: string;
  privateKey: string;
};

const DEVICE_IDENTITY_STORAGE_KEY = 'gabinete-filosofo.openclaw.device-identity.v1';
const DEVICE_AUTH_STORAGE_KEY = 'gabinete-filosofo.openclaw.device-auth.v1';

function getSafeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.slice().buffer);
  return bytesToHex(new Uint8Array(hash));
}

async function generateIdentity(): Promise<BrowserDeviceIdentity> {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  const deviceId = await fingerprintPublicKey(publicKey);
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  };
}

export async function loadOrCreateDeviceIdentity(): Promise<BrowserDeviceIdentity> {
  const storage = getSafeLocalStorage();
  try {
    const raw = storage?.getItem(DEVICE_IDENTITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKey === 'string' &&
        typeof parsed.privateKey === 'string'
      ) {
        const derivedId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey));
        if (derivedId !== parsed.deviceId) {
          const updated: StoredIdentity = {
            ...parsed,
            deviceId: derivedId,
          };
          storage?.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(updated));
          return {
            deviceId: derivedId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          };
        }
        return {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch {
    // regenerate below
  }

  const identity = await generateIdentity();
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now(),
  };
  storage?.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(stored));
  return identity;
}

function normalizeRole(role: string): string {
  return role.trim();
}

function normalizeScopes(scopes: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  const out = new Set<string>();
  for (const scope of scopes) {
    if (typeof scope !== 'string') {
      continue;
    }
    const trimmed = scope.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  if (out.has('operator.admin')) {
    out.add('operator.read');
    out.add('operator.write');
  } else if (out.has('operator.write')) {
    out.add('operator.read');
  }
  return [...out].sort();
}

function readDeviceAuthStore(): StoredDeviceAuthStore | null {
  const storage = getSafeLocalStorage();
  try {
    const raw = storage?.getItem(DEVICE_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredDeviceAuthStore;
    if (!parsed || parsed.version !== 1) {
      return null;
    }
    if (typeof parsed.deviceId !== 'string' || !parsed.tokens || typeof parsed.tokens !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDeviceAuthStore(store: StoredDeviceAuthStore) {
  const storage = getSafeLocalStorage();
  try {
    storage?.setItem(DEVICE_AUTH_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // best effort
  }
}

function copyCanonicalTokens(tokens: Record<string, unknown>): Record<string, StoredDeviceAuthEntry> {
  const out: Record<string, StoredDeviceAuthEntry> = {};
  for (const [rawRole, value] of Object.entries(tokens)) {
    const role = normalizeRole(rawRole);
    if (!role || !value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const token = (value as { token?: unknown }).token;
    if (typeof token !== 'string') {
      continue;
    }
    out[role] = {
      token,
      role,
      scopes: normalizeScopes(Array.isArray((value as { scopes?: unknown[] }).scopes) ? (value as { scopes?: unknown[] }).scopes : undefined),
      updatedAtMs:
        typeof (value as { updatedAtMs?: unknown }).updatedAtMs === 'number' &&
        Number.isFinite((value as { updatedAtMs?: number }).updatedAtMs)
          ? (value as { updatedAtMs?: number }).updatedAtMs
          : 0,
    };
  }
  return out;
}

export function loadDeviceAuthToken(params: { deviceId: string; role: string }): StoredDeviceAuthEntry | null {
  const store = readDeviceAuthStore();
  if (!store || store.deviceId !== params.deviceId) {
    return null;
  }
  const role = normalizeRole(params.role);
  const entry = store.tokens[role];
  if (!entry || typeof entry.token !== 'string') {
    return null;
  }
  return {
    token: entry.token,
    role,
    scopes: normalizeScopes(entry.scopes),
    updatedAtMs:
      typeof entry.updatedAtMs === 'number' && Number.isFinite(entry.updatedAtMs) ? entry.updatedAtMs : 0,
  };
}

export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): StoredDeviceAuthEntry {
  const role = normalizeRole(params.role);
  const current = readDeviceAuthStore();
  const next: StoredDeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens:
      current && current.deviceId === params.deviceId && current.tokens
        ? copyCanonicalTokens(current.tokens)
        : {},
  };
  const entry: StoredDeviceAuthEntry = {
    token: params.token,
    role,
    scopes: normalizeScopes(params.scopes),
    updatedAtMs: Date.now(),
  };
  next.tokens[role] = entry;
  writeDeviceAuthStore(next);
  return entry;
}

export function clearDeviceAuthToken(params: { deviceId: string; role: string }) {
  const store = readDeviceAuthStore();
  if (!store || store.deviceId !== params.deviceId) {
    return;
  }
  const role = normalizeRole(params.role);
  if (!store.tokens[role]) {
    return;
  }
  const next: StoredDeviceAuthStore = {
    version: 1,
    deviceId: store.deviceId,
    tokens: copyCanonicalTokens(store.tokens),
  };
  delete next.tokens[role];
  writeDeviceAuthStore(next);
}

export async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const signature = await signAsync(data, key);
  return base64UrlEncode(signature);
}

export function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
}): string {
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const platform = (params.platform ?? '').trim();
  const deviceFamily = (params.deviceFamily ?? '').trim();
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join('|');
}

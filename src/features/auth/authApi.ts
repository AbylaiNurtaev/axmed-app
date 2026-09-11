import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { SocialAuthCredential } from "./socialAuth";
import type { AuthMode } from "./types";

const refreshTokenKey = "axmed.refreshToken";
const defaultApiUrl = Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl).replace(/\/$/, "");

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type VerificationResult = {
  email: string;
  requiresVerification: true;
  expiresIn: number;
  verificationCode?: string;
};

type ApiErrorPayload = {
  error?: { code?: string; message?: string };
};

export class AuthApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

let currentSession: AuthSession | null = null;
let sessionRevision = 0;
const sessionListeners = new Set<() => void>();
let refreshing: Promise<AuthSession | null> | undefined;
let storageQueue: Promise<void> = Promise.resolve();

export function getSessionUserId() { return currentSession?.user.id ?? null; }
export function subscribeSession(listener: () => void) {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}
function emitSession() { sessionListeners.forEach(listener => listener()); }

export async function registerWithEmail(email: string, password: string) {
  return request<VerificationResult>("/api/auth/register", { email, password });
}

export async function verifyEmail(email: string, code: string) {
  const revision = sessionRevision;
  const session = await request<AuthSession>("/api/auth/verify-email", { email, code });
  if (!await saveSession(session, revision)) throw new AuthApiError("authRequired", "Сессия завершена. Войдите снова.", 401);
  return session;
}

export async function resendVerificationCode(email: string) {
  return request<VerificationResult>("/api/auth/resend-code", { email });
}

export async function loginWithEmail(email: string, password: string) {
  const revision = sessionRevision;
  const session = await request<AuthSession>("/api/auth/login", { email, password });
  if (!await saveSession(session, revision)) throw new AuthApiError("authRequired", "Сессия завершена. Войдите снова.", 401);
  return session;
}

export async function authenticateWithSocial(credential: SocialAuthCredential, mode: AuthMode) {
  const revision = sessionRevision;
  const session = await request<AuthSession>("/api/auth/social", {
    provider: credential.provider,
    mode,
    idToken: credential.idToken,
    authorizationCode: credential.authorizationCode,
    profile: {
      name: credential.profile.name,
      givenName: credential.profile.givenName,
      familyName: credential.profile.familyName
    }
  });
  if (!await saveSession(session, revision)) throw new AuthApiError("authRequired", "Сессия завершена. Войдите снова.", 401);
  return session;
}

export async function restoreSession(): Promise<AuthSession | null> {
  const revision = sessionRevision;
  const refreshToken = await readRefreshToken();
  if (!refreshToken || revision !== sessionRevision) return null;

  try {
    const session = await request<AuthSession>("/api/auth/refresh", { refreshToken });
    if (revision !== sessionRevision) return null;
    if (!await saveSession(session, revision)) return null;
    return session;
  } catch (error) {
    if (revision !== sessionRevision) return null;
    if (error instanceof AuthApiError && error.status === 401) {
      await clearStoredSession();
    } else {
      currentSession = null;
      emitSession();
    }
    return null;
  }
}

export async function logout() {
  sessionRevision += 1;
  const refreshToken = currentSession?.refreshToken ?? await readRefreshToken();
  currentSession = null;
  emitSession();
  await removeRefreshToken();
  if (!refreshToken) return;

  try {
    await request<void>("/api/auth/logout", { refreshToken });
  } catch {
    // Local credentials are already removed; server expiration remains the fallback.
  }
}

export function getAccessToken() {
  return currentSession?.accessToken ?? null;
}

async function request<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { body });
}

export async function authenticatedRequest<T>(path: string, options: { body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal } = {}): Promise<T> {
  const owner = getSessionUserId();
  const revision = sessionRevision;
  if (!owner || !currentSession) throw new AuthApiError("authRequired", "Войдите в аккаунт.", 401);
  try {
    return await apiRequest<T>(path, { ...options, accessToken: currentSession.accessToken });
  } catch (error) {
    if (!(error instanceof AuthApiError) || error.status !== 401 || options.signal?.aborted) throw error;
    if (revision !== sessionRevision || getSessionUserId() !== owner) throw error;
    if (!refreshing) refreshing = restoreSession().finally(() => { refreshing = undefined; });
    const session = await refreshing;
    if (!session || revision !== sessionRevision || session.user.id !== owner || options.signal?.aborted) throw error;
    return apiRequest<T>(path, { ...options, accessToken: session.accessToken });
  }
}

async function apiRequest<T>(path: string, options: { body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal; accessToken?: string }): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 12_000);

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: options.method ?? "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json",
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });

    const payload = response.status === 204
      ? undefined
      : await response.json().catch(() => undefined) as T | ApiErrorPayload | undefined;

    if (!response.ok) {
      const errorPayload = payload as ApiErrorPayload | undefined;
      throw new AuthApiError(
        errorPayload?.error?.code ?? "REQUEST_FAILED",
        errorPayload?.error?.message ?? "Не удалось выполнить запрос.",
        response.status
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof AuthApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AuthApiError("TIMEOUT", "Сервер не ответил вовремя. Попробуйте ещё раз.", 0);
    }
    throw new AuthApiError(
      "NETWORK_ERROR",
      "Нет соединения с сервером. Проверьте сеть и адрес EXPO_PUBLIC_API_URL.",
      0
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

async function saveSession(session: AuthSession, revision: number) {
  if (revision !== sessionRevision) return false;
  currentSession = session;
  await writeRefreshToken(session.refreshToken);
  if (revision !== sessionRevision) return false;
  emitSession();
  return true;
}

async function clearStoredSession() {
  currentSession = null;
  emitSession();
  await removeRefreshToken();
}

async function readRefreshToken() {
  await storageQueue;
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(refreshTokenKey) ?? null;
  return SecureStore.getItemAsync(refreshTokenKey);
}

async function writeRefreshToken(value: string) {
  await mutateStorage(async () => {
    if (Platform.OS === "web") { globalThis.localStorage?.setItem(refreshTokenKey, value); return; }
    await SecureStore.setItemAsync(refreshTokenKey, value);
  });
}

async function removeRefreshToken() {
  await mutateStorage(async () => {
    if (Platform.OS === "web") { globalThis.localStorage?.removeItem(refreshTokenKey); return; }
    await SecureStore.deleteItemAsync(refreshTokenKey);
  });
}

function mutateStorage(operation: () => Promise<void>) {
  const next = storageQueue.then(operation);
  storageQueue = next.catch(() => undefined);
  return next;
}

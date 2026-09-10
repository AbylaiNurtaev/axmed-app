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

export async function registerWithEmail(email: string, password: string) {
  return request<VerificationResult>("/api/auth/register", { email, password });
}

export async function verifyEmail(email: string, code: string) {
  const session = await request<AuthSession>("/api/auth/verify-email", { email, code });
  await saveSession(session);
  return session;
}

export async function resendVerificationCode(email: string) {
  return request<VerificationResult>("/api/auth/resend-code", { email });
}

export async function loginWithEmail(email: string, password: string) {
  const session = await request<AuthSession>("/api/auth/login", { email, password });
  await saveSession(session);
  return session;
}

export async function authenticateWithSocial(credential: SocialAuthCredential, mode: AuthMode) {
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
  await saveSession(session);
  return session;
}

export async function restoreSession(): Promise<AuthSession | null> {
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return null;

  try {
    const session = await request<AuthSession>("/api/auth/refresh", { refreshToken });
    await saveSession(session);
    return session;
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      await clearStoredSession();
    } else {
      currentSession = null;
    }
    return null;
  }
}

export async function logout() {
  const refreshToken = currentSession?.refreshToken ?? await readRefreshToken();
  currentSession = null;
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
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
  }
}

async function saveSession(session: AuthSession) {
  currentSession = session;
  await writeRefreshToken(session.refreshToken);
}

async function clearStoredSession() {
  currentSession = null;
  await removeRefreshToken();
}

async function readRefreshToken() {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(refreshTokenKey) ?? null;
  return SecureStore.getItemAsync(refreshTokenKey);
}

async function writeRefreshToken(value: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(refreshTokenKey, value);
    return;
  }
  await SecureStore.setItemAsync(refreshTokenKey, value);
}

async function removeRefreshToken() {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(refreshTokenKey);
    return;
  }
  await SecureStore.deleteItemAsync(refreshTokenKey);
}

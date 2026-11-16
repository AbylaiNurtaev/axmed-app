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
  avatarUrl?: string | null;
  emailVerified: boolean;
};

export type ProfileData = {
  id: string;
  email: string | null;
  displayName: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: "male" | "female" | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  medicalProfile: Record<string, unknown>;
  appPreferences: Record<string, unknown>;
  updatedAt: string;
};

export type ProfileGoal = {
  id: string;
  templateKey: string | null;
  title: string;
  category: string;
  icon: string;
  color: string;
  currentValue: number;
  startValue: number;
  targetValue: number;
  unit: string;
  progress: number;
  status: "active" | "paused" | "completed";
  dueDate: string | null;
  metricKey: string;
  frequency: "daily" | "weekdays" | "threePerWeek" | "weekly";
  reminderEnabled: boolean;
  reminderTime: string | null;
  nextAction: string;
  description: string;
  progressSource: "manual" | "bracelet" | "scale";
  sourceRecordedAt: string | null;
  completedToday: boolean;
  weeklyCompletedActions: number;
  streakDays: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProfileGoalInput = {
  templateKey?: string | null;
  title: string;
  category?: string;
  icon?: string;
  color?: string;
  currentValue?: number;
  startValue?: number;
  targetValue?: number;
  unit?: string;
  progress?: number;
  status?: ProfileGoal["status"];
  dueDate?: string | null;
  metricKey?: string;
  frequency?: ProfileGoal["frequency"];
  reminderEnabled?: boolean;
  reminderTime?: string | null;
  nextAction?: string;
  description?: string;
};

export type PlanEvent = { localDate: string; status: "completed" | "skipped"; occurredAt: string };
export type PlanTask = {
  id: string;
  goalId: string | null;
  title: string;
  notes: string;
  dueAt: string | null;
  dueLocalDate: string | null;
  timeZone: string;
  recurrence: "none" | "daily" | "weekdays" | "weekly" | "custom";
  recurrenceDays: number[];
  reminderEnabled: boolean;
  reminderMinutesBefore: number;
  status: "active" | "archived";
  scheduledToday: boolean;
  todayStatus: "completed" | "skipped" | null;
  history: PlanEvent[];
  createdAt: string;
  updatedAt: string;
};
export type PlanHabit = {
  id: string;
  goalId: string | null;
  title: string;
  description: string;
  icon: string;
  color: string;
  scheduleType: "daily" | "weekdays" | "days" | "timesPerWeek" | "custom";
  scheduleDays: number[];
  targetPerWeek: number;
  reminderEnabled: boolean;
  reminderTime: string | null;
  status: "active" | "paused" | "archived";
  scheduledToday: boolean;
  todayStatus: "completed" | "skipped" | null;
  streakDays: number;
  weekCompleted: number;
  weekProgress: number;
  history: PlanEvent[];
  createdAt: string;
  updatedAt: string;
};
export type PlanTaskInput = Pick<PlanTask, "title" | "timeZone"> & Partial<Pick<PlanTask, "goalId" | "notes" | "dueAt" | "dueLocalDate" | "recurrence" | "recurrenceDays" | "reminderEnabled" | "reminderMinutesBefore" | "status">>;
export type PlanHabitInput = Pick<PlanHabit, "title" | "scheduleType"> & Partial<Pick<PlanHabit, "goalId" | "description" | "icon" | "color" | "scheduleDays" | "targetPerWeek" | "reminderEnabled" | "reminderTime" | "status">>;
export type PlanAchievement = { key: string; title: string; description: string; icon: string; unlockedAt: string };
export type PlanGamification = {
  points: number;
  level: number;
  levelTitle: string;
  nextLevelPoints: number;
  levelProgress: number;
  streakDays: number;
  weeklySequence: Array<{ date: string; points: number; active: boolean }>;
  monthActivity: Array<{ date: string; points: number; active: boolean }>;
  completedGoals: number;
  achievements: PlanAchievement[];
};
export type PlanGoal = ProfileGoal & {
  tasks: PlanTask[];
  habits: PlanHabit[];
  history: Array<{ type: string; source: string; value: number | null; unit: string | null; occurredAt: string }>;
};
export type PlanWorkspace = {
  referenceDate: string;
  timeZone: string;
  goals: PlanGoal[];
  tasks: PlanTask[];
  habits: PlanHabit[];
  calendar: Array<{ date: string; tasks: number; habits: number; points: number }>;
  gamification: PlanGamification;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type ActiveSession = {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type VerificationResult = {
  email: string;
  requiresVerification: true;
  expiresIn: number;
  verificationCode?: string;
};

type ApiErrorPayload = {
  error?: { code?: string; message?: string; retryAfterSeconds?: number };
};

export class AuthApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number
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

export type PasswordResetRequest = { message: string; expiresIn: number; resendAfter: number };
export function requestPasswordReset(email: string, signal?: AbortSignal) {
  return apiRequest<PasswordResetRequest>("/api/auth/password-reset/request", { body: { email }, signal });
}
export function verifyPasswordResetCode(email: string, code: string, signal?: AbortSignal) {
  return apiRequest<{ resetToken: string; expiresIn: number }>("/api/auth/password-reset/verify", { body: { email, code }, signal });
}
export function completePasswordReset(email: string, resetToken: string, password: string, signal?: AbortSignal) {
  return apiRequest<void>("/api/auth/password-reset/complete", { body: { email, resetToken, password }, signal });
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

// Only an absent or rejected refresh token means signed out. Other failures can be retried.
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
      return null;
    }
    throw error;
  }
}

export async function logout() {
  const refreshToken = currentSession?.refreshToken ?? await readRefreshToken();
  await clearLocalAccount();
  if (!refreshToken) return;

  try {
    await request<void>("/api/auth/logout", { refreshToken });
  } catch {
    // Local credentials are already removed; server expiration remains the fallback.
  }
}

export async function logoutAllSessions() {
  await authenticatedRequest<void>("/api/security/logout-all", { body: {} });
  await clearLocalAccount();
}

export async function clearLocalAccount() {
  const userId = currentSession?.user.id;
  sessionRevision += 1;
  currentSession = null;
  emitSession();
  await removeRefreshToken();
  if (userId) {
    const [{ cancelAllPlanRemindersForUser }, { clearProfileNotifications }, { clearGoalRemindersForUser }] = await Promise.all([
      import("../plan/planReminders"), import("../profile/profileNotifications"), import("../plan/goalReminders")
    ]);
    await Promise.allSettled([cancelAllPlanRemindersForUser(userId), clearProfileNotifications(userId), clearGoalRemindersForUser(userId)]);
  }
}

export function getAccessToken() {
  return currentSession?.accessToken ?? null;
}

async function request<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { body });
}

export async function authenticatedRequest<T>(path: string, options: { body?: unknown; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
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

export async function loadProfile() {
  return authenticatedRequest<ProfileData>("/api/profile", { method: "GET" });
}

export type ProfileSaveInput = Partial<Pick<ProfileData, "fullName" | "firstName" | "lastName" | "phone" | "birthDate" | "gender">> & {
  medicalProfile?: Record<string, unknown>;
  appPreferences?: Record<string, unknown>;
};

export async function saveProfile(input: ProfileSaveInput) {
  const profile = await authenticatedRequest<ProfileData>("/api/profile", { method: "PATCH", body: input });
  mergeCurrentUser(profile);
  return profile;
}

export async function uploadProfileAvatar(input: { fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; dataBase64: string }) {
  const profile = await authenticatedRequest<ProfileData>("/api/profile/avatar", { body: input });
  mergeCurrentUser(profile);
  return profile;
}

export async function deleteProfileAvatar() {
  const profile = await authenticatedRequest<ProfileData>("/api/profile/avatar", { method: "DELETE" });
  mergeCurrentUser(profile);
  return profile;
}

export function loadActiveSessions() {
  return authenticatedRequest<ActiveSession[]>("/api/security/sessions", { method: "GET" });
}

export type AccountDeletionInfo = { hasPassword: boolean; providers: Array<"google" | "apple">; appleRevocationReady: boolean };
export type AccountDeletionProof = { method: "password"; password: string }
  | { method: "google"; idToken: string }
  | { method: "apple"; idToken: string; authorizationCode: string };

export function loadAccountDeletionInfo(signal?: AbortSignal) {
  return authenticatedRequest<AccountDeletionInfo>("/api/security/account-deletion", { method: "GET", signal });
}

export async function deleteMyAccount(proof: AccountDeletionProof) {
  const owner = getSessionUserId();
  await authenticatedRequest<void>("/api/security/account-deletion", { body: { confirmation: "DELETE", ...proof }, timeoutMs: 30_000 });
  if (getSessionUserId() === owner) await clearLocalAccount();
}

export async function changeAccountPassword(currentPassword: string, newPassword: string) {
  await authenticatedRequest<void>("/api/security/change-password", { body: { currentPassword, newPassword } });
}

export async function closeActiveSession(sessionId: string) {
  await authenticatedRequest<void>(`/api/security/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export async function loadProfileGoals(localDate?: string) {
  const query = localDate ? `?localDate=${encodeURIComponent(localDate)}` : "";
  const payload = await authenticatedRequest<{ goals: ProfileGoal[] }>(`/api/profile/goals${query}`, { method: "GET" });
  return payload.goals;
}

export async function createProfileGoal(input: ProfileGoalInput) {
  return authenticatedRequest<ProfileGoal>("/api/profile/goals", { body: input });
}

export async function updateProfileGoal(goalId: string, input: Partial<ProfileGoalInput> & { sortOrder?: number; localDate?: string; mutationId?: string }) {
  return authenticatedRequest<ProfileGoal>(`/api/profile/goals/${goalId}`, { method: "PATCH", body: input });
}

export async function deleteProfileGoal(goalId: string) {
  await authenticatedRequest<void>(`/api/profile/goals/${goalId}`, { method: "DELETE" });
}

export async function completeProfileGoalAction(goalId: string, localDate: string) {
  await authenticatedRequest<{ goalId: string; localDate: string }>(`/api/profile/goals/${goalId}/checkins`, { body: { localDate } });
}

export async function undoProfileGoalAction(goalId: string, localDate: string) {
  await authenticatedRequest<void>(`/api/profile/goals/${goalId}/checkins/${encodeURIComponent(localDate)}`, { method: "DELETE" });
}

export async function loadPlanWorkspace(localDate: string, timeZone: string) {
  return authenticatedRequest<PlanWorkspace>(`/api/plan?localDate=${encodeURIComponent(localDate)}&timeZone=${encodeURIComponent(timeZone)}`, { method: "GET" });
}

export async function createPlanTask(input: PlanTaskInput) {
  return authenticatedRequest<PlanTask>("/api/plan/tasks", { body: input });
}
export async function updatePlanTask(taskId: string, input: Partial<PlanTaskInput>) {
  return authenticatedRequest<PlanTask>(`/api/plan/tasks/${taskId}`, { method: "PATCH", body: input });
}
export async function deletePlanTask(taskId: string) {
  return authenticatedRequest<void>(`/api/plan/tasks/${taskId}`, { method: "DELETE" });
}
export async function setPlanTaskEvent(taskId: string, input: { localDate: string; status: "completed" | "skipped"; mutationId: string }) {
  return authenticatedRequest<void>(`/api/plan/tasks/${taskId}/events`, { method: "PUT", body: input });
}
export async function undoPlanTaskEvent(taskId: string, localDate: string) {
  return authenticatedRequest<void>(`/api/plan/tasks/${taskId}/events/${encodeURIComponent(localDate)}`, { method: "DELETE" });
}

export async function createPlanHabit(input: PlanHabitInput) {
  return authenticatedRequest<PlanHabit>("/api/plan/habits", { body: input });
}
export async function updatePlanHabit(habitId: string, input: Partial<PlanHabitInput>) {
  return authenticatedRequest<PlanHabit>(`/api/plan/habits/${habitId}`, { method: "PATCH", body: input });
}
export async function deletePlanHabit(habitId: string) {
  return authenticatedRequest<void>(`/api/plan/habits/${habitId}`, { method: "DELETE" });
}
export async function setPlanHabitEvent(habitId: string, input: { localDate: string; status: "completed" | "skipped"; mutationId: string }) {
  return authenticatedRequest<void>(`/api/plan/habits/${habitId}/events`, { method: "PUT", body: input });
}
export async function undoPlanHabitEvent(habitId: string, localDate: string) {
  return authenticatedRequest<void>(`/api/plan/habits/${habitId}/events/${encodeURIComponent(localDate)}`, { method: "DELETE" });
}
export async function updatePlanGoalProgress(goalId: string, input: { value: number; mutationId: string; localDate: string }) {
  return authenticatedRequest<void>(`/api/plan/goals/${goalId}/progress`, { body: input });
}

async function apiRequest<T>(path: string, options: { body?: unknown; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; signal?: AbortSignal; accessToken?: string; timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, Math.min(options.timeoutMs ?? 12_000, 30_000));

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
        response.status,
        errorPayload?.error?.retryAfterSeconds ?? (Number(response.headers.get("Retry-After")) || undefined)
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

function mergeCurrentUser(profile: Pick<ProfileData, "id" | "email" | "displayName" | "avatarUrl" | "emailVerified">) {
  if (!currentSession || currentSession.user.id !== profile.id) return;
  currentSession = {
    ...currentSession,
    user: {
      ...currentSession.user,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      emailVerified: profile.emailVerified
    }
  };
  emitSession();
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

import cors from "cors";
import express, { type Request, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { query } from "./database.js";
import { ApiError, errorHandler } from "./errors.js";
import { deviceSyncSchema } from "./deviceSchemas.js";
import { loadDeviceReadings, requireDeviceUser, requireSession, saveDeviceReadings } from "./deviceService.js";
import { completeGoalAction, createGoal, deleteGoal, listGoals, undoGoalAction, updateGoal } from "./goalService.js";
import { createHabit, createTask, deleteHabit, deleteTask, loadPlanWorkspace, setHabitEvent, setTaskEvent, undoHabitEvent, undoTaskEvent, updateGoalManually, updateHabit, updateTask } from "./planService.js";
import { loadProfile, removeAvatar, updateProfile, uploadAvatar } from "./profileService.js";
import { requestPasswordReset, resetPassword, verifyPasswordResetCode } from "./passwordRecoveryService.js";
import {
  authenticateSocial,
  loginWithEmail,
  registerWithEmail,
  resendVerificationCode,
  changePassword,
  listActiveSessions,
  revokeAllSessions,
  revokeSession,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyEmail
} from "./authService.js";
import {
  credentialsSchema,
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  resetPasswordSchema,
  refreshSchema,
  sessionIdSchema,
  goalCreateSchema,
  goalCheckinSchema,
  goalUpdateSchema,
  socialAuthSchema,
  avatarUploadSchema,
  profileUpdateSchema,
  planHabitCreateSchema,
  planHabitEventSchema,
  planHabitUpdateSchema,
  planManualProgressSchema,
  planTaskCreateSchema,
  planTaskEventSchema,
  planTaskUpdateSchema,
  verifyEmailSchema
} from "./schemas.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins === "*" ? true : config.corsOrigins,
  credentials: false
}));
// Reject unauthenticated requests before allocating/parsing a large history body.
app.use("/api/devices", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/devices", (request, _response, next) => {
  void requireDeviceUser(request.get("authorization")).then(() => next()).catch(next);
});
app.use("/api/devices", express.json({ limit: "24mb" }));
app.use("/api/profile", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/profile", (request, _response, next) => {
  void requireDeviceUser(request.get("authorization")).then((userId) => {
    responseLocals(request).userId = userId;
    next();
  }).catch(next);
});
app.use("/api/profile/avatar", express.json({ limit: "8mb" }));
app.use("/api/profile", express.json({ limit: "64kb" }));
app.use("/api/security", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/security", (request, _response, next) => {
  void requireSession(request.get("authorization")).then(({ userId, sessionId }) => {
    responseLocals(request).userId = userId;
    responseLocals(request).sessionId = sessionId;
    next();
  }).catch(next);
});
app.use("/api/security", express.json({ limit: "16kb" }));
app.use("/api/plan", rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/plan", (request, _response, next) => {
  void requireDeviceUser(request.get("authorization")).then((userId) => {
    responseLocals(request).userId = userId;
    next();
  }).catch(next);
});
app.use(express.json({ limit: "16kb" }));
app.use((_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false
});
const credentialLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false
});
const throttled: RequestHandler = (_request, response) => {
  response.status(429).json({ error: { code: "TOO_MANY_REQUESTS", message: "Слишком много запросов. Попробуйте позже.",
    retryAfterSeconds: Number(response.getHeader("Retry-After")) || 60 } });
};
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, skipSuccessfulRequests: true,
  standardHeaders: "draft-8", legacyHeaders: false, handler: throttled });
const recoveryLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30,
  standardHeaders: "draft-8", legacyHeaders: false, handler: throttled });

app.get("/health", asyncHandler(async (_request, response) => {
  await query("SELECT 1");
  response.json({ status: "ok" });
}));

// Login floods must not exhaust the independent recovery budget.
app.use(["/api/auth/register", "/api/auth/verify-email", "/api/auth/resend-code",
  "/api/auth/social", "/api/auth/refresh", "/api/auth/logout"], authLimiter);

app.post("/api/auth/register", credentialLimiter, asyncHandler(async (request, response) => {
  const { email, password } = credentialsSchema.parse(request.body);
  response.status(201).json(await registerWithEmail(email, password));
}));

app.post("/api/auth/verify-email", credentialLimiter, asyncHandler(async (request, response) => {
  const { email, code } = verifyEmailSchema.parse(request.body);
  response.json(await verifyEmail(email, code, requestMetadata(request)));
}));

app.post("/api/auth/resend-code", credentialLimiter, asyncHandler(async (request, response) => {
  const { email } = emailOnlySchema.parse(request.body);
  response.json(await resendVerificationCode(email));
}));

app.post("/api/auth/login", loginLimiter, asyncHandler(async (request, response) => {
  const { email, password } = loginSchema.parse(request.body);
  response.json(await loginWithEmail(email, password, requestMetadata(request)));
}));

app.post("/api/auth/password-reset/request", recoveryLimiter, asyncHandler(async (request, response) => {
  const { email } = emailOnlySchema.parse(request.body);
  response.json(await requestPasswordReset(email));
}));
app.post("/api/auth/password-reset/verify", recoveryLimiter, asyncHandler(async (request, response) => {
  const { email, code } = verifyEmailSchema.parse(request.body);
  response.json(await verifyPasswordResetCode(email, code));
}));
app.post("/api/auth/password-reset/complete", recoveryLimiter, asyncHandler(async (request, response) => {
  const { email, resetToken, password } = resetPasswordSchema.parse(request.body);
  await resetPassword(email, resetToken, password);
  response.status(204).send();
}));

app.post("/api/auth/social", credentialLimiter, asyncHandler(async (request, response) => {
  const input = socialAuthSchema.parse(request.body);
  response.json(await authenticateSocial(input, requestMetadata(request)));
}));

app.post("/api/auth/refresh", asyncHandler(async (request, response) => {
  const { refreshToken } = refreshSchema.parse(request.body);
  response.json(await rotateRefreshToken(refreshToken, requestMetadata(request)));
}));

app.post("/api/auth/logout", asyncHandler(async (request, response) => {
  const { refreshToken } = refreshSchema.parse(request.body);
  await revokeRefreshToken(refreshToken);
  response.status(204).send();
}));

app.get("/api/security/sessions", asyncHandler(async (request, response) => {
  const locals = responseLocals(request);
  response.json(await listActiveSessions(locals.userId, locals.sessionId));
}));

app.post("/api/security/change-password", credentialLimiter, asyncHandler(async (request, response) => {
  const input = changePasswordSchema.parse(request.body);
  const locals = responseLocals(request);
  await changePassword(locals.userId, locals.sessionId, input.currentPassword, input.newPassword);
  response.status(204).send();
}));

app.delete("/api/security/sessions/:sessionId", asyncHandler(async (request, response) => {
  const sessionId = sessionIdSchema.parse(request.params.sessionId);
  await revokeSession(responseLocals(request).userId, sessionId);
  response.status(204).send();
}));

app.post("/api/security/logout-all", asyncHandler(async (request, response) => {
  await revokeAllSessions(responseLocals(request).userId);
  response.status(204).send();
}));

app.post("/api/devices/sync", asyncHandler(async (request, response) => {
  const userId = await requireDeviceUser(request.get("authorization"));
  const input = deviceSyncSchema.parse(request.body);
  response.json(await saveDeviceReadings(userId, input));
}));
app.get("/api/devices/readings", asyncHandler(async (request, response) => {
  const userId = await requireDeviceUser(request.get("authorization"));
  const kind = request.query.kind;
  if (kind !== undefined && kind !== "fitness-band" && kind !== "scale") {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Неизвестный тип устройства." } });
    return;
  }
  response.json(await loadDeviceReadings(userId, kind));
}));

app.get("/api/profile", asyncHandler(async (request, response) => {
  response.json(await loadProfile(responseLocals(request).userId));
}));

app.patch("/api/profile", asyncHandler(async (request, response) => {
  const input = profileUpdateSchema.parse(request.body);
  response.json(await updateProfile(responseLocals(request).userId, input));
}));

app.post("/api/profile/avatar", asyncHandler(async (request, response) => {
  const input = avatarUploadSchema.parse(request.body);
  response.status(201).json(await uploadAvatar(responseLocals(request).userId, input.fileName, input.mimeType, input.dataBase64));
}));

app.delete("/api/profile/avatar", asyncHandler(async (request, response) => {
  response.json(await removeAvatar(responseLocals(request).userId));
}));

app.get("/api/profile/goals", asyncHandler(async (request, response) => {
  const localDate = typeof request.query.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.query.localDate)
    ? request.query.localDate
    : undefined;
  response.json(await listGoals(responseLocals(request).userId, localDate));
}));

app.post("/api/profile/goals", asyncHandler(async (request, response) => {
  const input = goalCreateSchema.parse(request.body);
  response.status(201).json(await createGoal(responseLocals(request).userId, input));
}));

app.patch("/api/profile/goals/:goalId", asyncHandler(async (request, response) => {
  const input = goalUpdateSchema.parse(request.body);
  const { goalId } = request.params;
  if (typeof goalId !== "string") {
    response.status(400).json({ error: { code: "GOAL_ID_REQUIRED", message: "Не указан идентификатор цели." } });
    return;
  }
  response.json(await updateGoal(responseLocals(request).userId, goalId, input));
}));

app.delete("/api/profile/goals/:goalId", asyncHandler(async (request, response) => {
  const { goalId } = request.params;
  if (typeof goalId !== "string") {
    response.status(400).json({ error: { code: "GOAL_ID_REQUIRED", message: "Не указан идентификатор цели." } });
    return;
  }
  await deleteGoal(responseLocals(request).userId, goalId);
  response.status(204).send();
}));

app.post("/api/profile/goals/:goalId/checkins", asyncHandler(async (request, response) => {
  const { goalId } = request.params;
  if (typeof goalId !== "string") {
    response.status(400).json({ error: { code: "GOAL_ID_REQUIRED", message: "Не указан идентификатор цели." } });
    return;
  }
  const { localDate } = goalCheckinSchema.parse(request.body);
  await completeGoalAction(responseLocals(request).userId, goalId, localDate);
  response.status(201).json({ goalId, localDate });
}));

app.delete("/api/profile/goals/:goalId/checkins/:localDate", asyncHandler(async (request, response) => {
  const { goalId, localDate } = request.params;
  if (typeof goalId !== "string" || typeof localDate !== "string") {
    response.status(400).json({ error: { code: "GOAL_CHECKIN_REQUIRED", message: "Не указано действие цели." } });
    return;
  }
  const parsed = goalCheckinSchema.parse({ localDate });
  await undoGoalAction(responseLocals(request).userId, goalId, parsed.localDate);
  response.status(204).send();
}));

app.get("/api/plan", asyncHandler(async (request, response) => {
  const localDate = typeof request.query.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.query.localDate)
    ? request.query.localDate : new Date().toISOString().slice(0, 10);
  const timeZone = typeof request.query.timeZone === "string" ? request.query.timeZone.slice(0, 100) : "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone }); } catch { response.status(400).json({ error: { code: "INVALID_TIME_ZONE", message: "Неизвестный часовой пояс." } }); return; }
  response.json(await loadPlanWorkspace(responseLocals(request).userId, localDate, timeZone));
}));

app.post("/api/plan/tasks", asyncHandler(async (request, response) => {
  response.status(201).json(await createTask(responseLocals(request).userId, planTaskCreateSchema.parse(request.body)));
}));
app.patch("/api/plan/tasks/:taskId", asyncHandler(async (request, response) => {
  response.json(await updateTask(responseLocals(request).userId, requiredParam(request.params.taskId, "TASK_ID_REQUIRED"), planTaskUpdateSchema.parse(request.body)));
}));
app.delete("/api/plan/tasks/:taskId", asyncHandler(async (request, response) => {
  await deleteTask(responseLocals(request).userId, requiredParam(request.params.taskId, "TASK_ID_REQUIRED"));
  response.status(204).send();
}));
app.put("/api/plan/tasks/:taskId/events", asyncHandler(async (request, response) => {
  const input = planTaskEventSchema.parse(request.body);
  await setTaskEvent(responseLocals(request).userId, requiredParam(request.params.taskId, "TASK_ID_REQUIRED"), input.localDate, input.status, input.mutationId);
  response.status(204).send();
}));
app.delete("/api/plan/tasks/:taskId/events/:localDate", asyncHandler(async (request, response) => {
  const localDate = goalCheckinSchema.parse({ localDate: request.params.localDate }).localDate;
  await undoTaskEvent(responseLocals(request).userId, requiredParam(request.params.taskId, "TASK_ID_REQUIRED"), localDate);
  response.status(204).send();
}));

app.post("/api/plan/habits", asyncHandler(async (request, response) => {
  response.status(201).json(await createHabit(responseLocals(request).userId, planHabitCreateSchema.parse(request.body)));
}));
app.patch("/api/plan/habits/:habitId", asyncHandler(async (request, response) => {
  response.json(await updateHabit(responseLocals(request).userId, requiredParam(request.params.habitId, "HABIT_ID_REQUIRED"), planHabitUpdateSchema.parse(request.body)));
}));
app.delete("/api/plan/habits/:habitId", asyncHandler(async (request, response) => {
  await deleteHabit(responseLocals(request).userId, requiredParam(request.params.habitId, "HABIT_ID_REQUIRED"));
  response.status(204).send();
}));
app.put("/api/plan/habits/:habitId/events", asyncHandler(async (request, response) => {
  const input = planHabitEventSchema.parse(request.body);
  await setHabitEvent(responseLocals(request).userId, requiredParam(request.params.habitId, "HABIT_ID_REQUIRED"), input.localDate, input.status, input.mutationId);
  response.status(204).send();
}));
app.delete("/api/plan/habits/:habitId/events/:localDate", asyncHandler(async (request, response) => {
  const localDate = goalCheckinSchema.parse({ localDate: request.params.localDate }).localDate;
  await undoHabitEvent(responseLocals(request).userId, requiredParam(request.params.habitId, "HABIT_ID_REQUIRED"), localDate);
  response.status(204).send();
}));

app.post("/api/plan/goals/:goalId/progress", asyncHandler(async (request, response) => {
  const input = planManualProgressSchema.parse(request.body);
  await updateGoalManually(responseLocals(request).userId, requiredParam(request.params.goalId, "GOAL_ID_REQUIRED"), input.value, input.mutationId, input.localDate);
  response.status(204).send();
}));

app.use((_request, response) => {
  response.status(404).json({ error: { code: "NOT_FOUND", message: "Маршрут не найден." } });
});
app.use(errorHandler);

function asyncHandler(handler: (request: Request, response: express.Response) => Promise<void>): RequestHandler {
  return (request, response, next) => void handler(request, response).catch(next);
}

function requestMetadata(request: Request) {
  return {
    userAgent: request.get("user-agent")?.slice(0, 500),
    ip: request.ip?.slice(0, 64)
  };
}

function responseLocals(request: Request) {
  return request.res!.locals as { userId: string; sessionId: string };
}

function requiredParam(value: string | string[] | undefined, code: string) {
  if (typeof value !== "string" || !value) throw new ApiError(400, code, "Не указан идентификатор.");
  return value;
}

import cors from "cors";
import express, { type Request, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { query } from "./database.js";
import { errorHandler } from "./errors.js";
import { deviceSyncSchema } from "./deviceSchemas.js";
import { loadDeviceReadings, requireDeviceUser, saveDeviceReadings } from "./deviceService.js";
import { createGoal, deleteGoal, listGoals, updateGoal } from "./goalService.js";
import { loadProfile, updateProfile, uploadAvatar } from "./profileService.js";
import {
  authenticateSocial,
  loginWithEmail,
  registerWithEmail,
  resendVerificationCode,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyEmail
} from "./authService.js";
import {
  credentialsSchema,
  emailOnlySchema,
  refreshSchema,
  goalCreateSchema,
  goalUpdateSchema,
  socialAuthSchema,
  avatarUploadSchema,
  profileUpdateSchema,
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

app.get("/health", asyncHandler(async (_request, response) => {
  await query("SELECT 1");
  response.json({ status: "ok" });
}));

app.use("/api/auth", authLimiter);

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

app.post("/api/auth/login", credentialLimiter, asyncHandler(async (request, response) => {
  const { email, password } = credentialsSchema.parse(request.body);
  response.json(await loginWithEmail(email, password, requestMetadata(request)));
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

app.post("/api/devices/sync", asyncHandler(async (request, response) => {
  const userId = await requireDeviceUser(request.get("authorization"));
  const input = deviceSyncSchema.parse(request.body);
  response.json(await saveDeviceReadings(userId, input));
}));
app.get("/api/devices/readings", asyncHandler(async (request, response) => {
  const userId = await requireDeviceUser(request.get("authorization"));
  response.json(await loadDeviceReadings(userId));
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

app.get("/api/profile/goals", asyncHandler(async (request, response) => {
  response.json(await listGoals(responseLocals(request).userId));
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
  return request.res!.locals as { userId: string };
}

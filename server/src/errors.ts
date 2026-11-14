import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    if (error.retryAfterSeconds !== undefined) response.setHeader("Retry-After", error.retryAfterSeconds);
    response.status(error.status).json({ error: { code: error.code, message: error.message,
      ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}) } });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Проверьте введённые данные.",
        fields: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      }
    });
    return;
  }

  console.error(error);
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера." } });
};

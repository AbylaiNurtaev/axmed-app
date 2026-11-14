import assert from "node:assert/strict";
import test from "node:test";
import { planHabitCreateSchema, planHabitEventSchema, planTaskCreateSchema, planTaskEventSchema } from "./schemas.js";

test("plan task schema keeps timezone, recurrence and reminder fields", () => {
  const parsed = planTaskCreateSchema.parse({
    title: "Прогулка", dueAt: "2026-11-14T13:00:00.000Z", dueLocalDate: "2026-11-14",
    timeZone: "Asia/Almaty", recurrence: "custom", recurrenceDays: [5, 1, 5],
    reminderEnabled: true, reminderMinutesBefore: 15
  });
  assert.deepEqual(parsed.recurrenceDays, [1, 5]);
  assert.equal(planTaskCreateSchema.safeParse({ title: "X", timeZone: "Mars/Olympus" }).success, false);
  assert.equal(planTaskEventSchema.safeParse({ localDate: "2026-11-14", status: "completed", mutationId: "mutation-123" }).success, true);
});

test("habit schemas support soft skips and bounded weekly targets", () => {
  assert.equal(planHabitCreateSchema.safeParse({ title: "Вода", scheduleType: "timesPerWeek", targetPerWeek: 4 }).success, true);
  assert.equal(planHabitCreateSchema.safeParse({ title: "Вода", scheduleType: "timesPerWeek", targetPerWeek: 50 }).success, false);
  assert.equal(planHabitEventSchema.safeParse({ localDate: "2026-11-14", status: "skipped", mutationId: "mutation-123" }).success, true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { goalCheckinSchema, goalCreateSchema, goalUpdateSchema } from "./schemas.js";

test("goal create accepts plan scheduling fields and rejects malformed reminders", () => {
  const input = goalCreateSchema.parse({
    title: "Больше шагов",
    metricKey: "steps",
    startValue: 6000,
    currentValue: 6500,
    targetValue: 8000,
    frequency: "daily",
    reminderEnabled: true,
    reminderTime: "19:30",
    nextAction: "Выполнить дневную цель"
  });
  assert.equal(input.metricKey, "steps");
  assert.equal(input.reminderTime, "19:30");
  assert.equal(goalCreateSchema.safeParse({ title: "Цель", reminderTime: "25:90" }).success, false);
});

test("goal update remains partial and check-ins require an ISO local date", () => {
  assert.equal(goalUpdateSchema.safeParse({ status: "completed" }).success, true);
  assert.equal(goalCheckinSchema.safeParse({ localDate: "2026-11-14" }).success, true);
  assert.equal(goalCheckinSchema.safeParse({ localDate: "14.11.2026" }).success, false);
});

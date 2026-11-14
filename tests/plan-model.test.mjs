import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateGoalProgress, goalTemplates, summarizePlan } from "../src/features/plan/planModel.ts";

test("goal progress supports both increasing and decreasing targets", () => {
  assert.equal(calculateGoalProgress(80, 75, 70), 50);
  assert.equal(calculateGoalProgress(6000, 7000, 8000), 50);
  assert.equal(calculateGoalProgress(10, 30, 20), 100);
  assert.equal(calculateGoalProgress(10, 5, 20), 0);
});

test("templates cover every requested creation path", () => {
  const keys = new Set(goalTemplates.map(template => template.templateKey));
  for (const key of ["weight-loss", "weight-maintain", "activity", "sleep", "water", "measurements", "steps", "custom"]) {
    assert.equal(keys.has(key), true, `missing template ${key}`);
  }
});

test("plan summary stays deterministic with more than twenty goals", () => {
  const goals = Array.from({ length: 24 }, (_, index) => ({
    id: String(index), status: index < 20 ? "active" : "completed", progress: 50,
    weeklyCompletedActions: index < 20 ? 2 : 0, streakDays: index % 7
  }));
  assert.deepEqual(summarizePlan(goals), {
    activeCount: 20,
    completedCount: 4,
    progress: 50,
    weeklyActions: 40,
    streakDays: 6
  });
});

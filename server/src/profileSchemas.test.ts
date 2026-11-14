import assert from "node:assert/strict";
import test from "node:test";
import { avatarUploadSchema, profileUpdateSchema } from "./schemas.js";

test("profile accepts separated names, timezone and wellness preferences", () => {
  const parsed = profileUpdateSchema.parse({
    firstName: "Абай",
    lastName: "Нуртаев",
    phone: "+7 (771) 594-37-38",
    birthDate: "1998-04-15",
    gender: "male",
    medicalProfile: { bodyMeasurements: { height: "181" } },
    appPreferences: {
      timezone: "Asia/Almaty", units: "metric", theme: "system", reduceMotion: true,
      highContrast: true, weightUnit: "kg", heightUnit: "cm", timeFormat: "24",
      firstDayOfWeek: "monday", autoSync: true, notificationGoals: true,
      notificationTime: "09:30", notificationDays: [1, 3, 5]
    }
  });
  assert.equal(parsed.firstName, "Абай");
  assert.equal(parsed.appPreferences?.timezone, "Asia/Almaty");
  assert.deepEqual(parsed.appPreferences?.notificationDays, [1, 3, 5]);
  assert.equal(profileUpdateSchema.safeParse({ firstName: "x".repeat(61) }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ appPreferences: { timezone: "x".repeat(81) } }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ appPreferences: { notificationTime: "25:00" } }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ appPreferences: { notificationDays: [0, 8] } }).success, false);
});

test("avatar upload only accepts bounded web image payloads", () => {
  const valid = { fileName: "avatar.jpg", mimeType: "image/jpeg", dataBase64: "a".repeat(64) };
  assert.equal(avatarUploadSchema.safeParse(valid).success, true);
  assert.equal(avatarUploadSchema.safeParse({ ...valid, mimeType: "image/heic" }).success, false);
  assert.equal(avatarUploadSchema.safeParse({ ...valid, fileName: "" }).success, false);
});

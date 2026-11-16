import { z } from "zod";

const emailPattern = /^(?=.{3,254}$)(?=.{1,64}@)[a-z0-9]+(?:[._%+-][a-z0-9]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(emailPattern, "Введите корректный email.");

export const passwordSchema = z
  .string()
  .min(8, "Пароль должен содержать минимум 8 символов.")
  .max(128, "Пароль не должен быть длиннее 128 символов.")
  .regex(/\p{L}/u, "Добавьте в пароль хотя бы одну букву.")
  .regex(/\p{N}/u, "Добавьте в пароль хотя бы одну цифру.");

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema
}).strict();

// Password strength is checked when setting a password, not when attempting login.
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
export const resetPasswordSchema = z.object({
  email: emailSchema,
  resetToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: passwordSchema
}).strict();

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Код должен состоять из шести цифр.")
}).strict();

export const emailOnlySchema = z.object({ email: emailSchema }).strict();

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512)
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema
}).strict().refine(value => value.currentPassword !== value.newPassword, {
  path: ["newPassword"], message: "Новый пароль должен отличаться от текущего."
});

export const sessionIdSchema = z.string().uuid();

export const deleteAccountSchema = z.discriminatedUnion("method", [
  z.object({ confirmation: z.literal("DELETE"), method: z.literal("password"), password: z.string().min(1).max(128) }).strict(),
  z.object({ confirmation: z.literal("DELETE"), method: z.literal("google"), idToken: z.string().min(20).max(20_000) }).strict(),
  z.object({ confirmation: z.literal("DELETE"), method: z.literal("apple"), idToken: z.string().min(20).max(20_000), authorizationCode: z.string().min(1).max(4_000) }).strict()
]);

export const socialAuthSchema = z.object({
  provider: z.enum(["google", "apple"]),
  mode: z.enum(["signUp", "signIn"]),
  idToken: z.string().min(20).max(20_000),
  authorizationCode: z.string().max(4_000).nullable().optional(),
  profile: z.object({
    name: z.string().trim().min(1).max(120).nullable().optional(),
    givenName: z.string().trim().min(1).max(60).nullable().optional(),
    familyName: z.string().trim().min(1).max(60).nullable().optional()
  }).strict().optional()
}).strict();

const profileText = (max: number) => z.string().trim().max(max).nullable();

export const profileUpdateSchema = z.object({
  fullName: profileText(120).optional(),
  firstName: profileText(60).optional(),
  lastName: profileText(60).optional(),
  phone: profileText(40).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  medicalProfile: z.object({
    goal: profileText(160).optional(),
    conditions: profileText(500).optional(),
    medications: profileText(500).optional(),
    allergies: profileText(500).optional(),
    lastCheckup: profileText(80).optional(),
    notes: profileText(1_000).optional(),
    bodyMeasurements: z.object({
      height: profileText(10).optional(),
      weight: profileText(10).optional(),
      waist: profileText(10).optional(),
      hips: profileText(10).optional(),
      chest: profileText(10).optional(),
      arm: profileText(10).optional(),
      calf: profileText(10).optional()
    }).strict().optional()
  }).strict().optional(),
  appPreferences: z.object({
    language: z.enum(["ru", "kk", "en"]).optional(),
    units: z.enum(["metric", "imperial"]).optional(),
    region: profileText(80).optional(),
    timezone: profileText(80).optional(),
    syncEnabled: z.boolean().optional(),
    dailyReminders: z.boolean().optional(),
    waterReminders: z.boolean().optional(),
    measurementReminders: z.boolean().optional(),
    recommendations: z.boolean().optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    textSize: z.enum(["small", "standard", "large"]).optional(),
    accentColor: z.enum(["green", "blue", "rose"]).optional(),
    animations: z.boolean().optional(),
    reduceMotion: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    weightUnit: z.enum(["kg", "lb"]).optional(),
    heightUnit: z.enum(["cm", "in"]).optional(),
    timeFormat: z.enum(["12", "24"]).optional(),
    firstDayOfWeek: z.enum(["monday", "sunday"]).optional(),
    autoSync: z.boolean().optional(),
    notificationGoals: z.boolean().optional(),
    notificationTasks: z.boolean().optional(),
    notificationHabits: z.boolean().optional(),
    notificationMeasurements: z.boolean().optional(),
    notificationBracelet: z.boolean().optional(),
    notificationScale: z.boolean().optional(),
    notificationWeeklyReport: z.boolean().optional(),
    notificationMarketing: z.boolean().optional(),
    notificationTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    notificationDays: z.array(z.number().int().min(1).max(7)).max(7).optional()
  }).strict().optional()
}).strict();

export const avatarUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z.string().min(32).max(7_000_000)
}).strict();

const goalNumber = z.coerce.number().finite().min(0).max(1_000_000);
const goalFrequency = z.enum(["daily", "weekdays", "threePerWeek", "weekly"]);
const goalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const goalCreateSchema = z.object({
  templateKey: z.string().trim().max(80).nullable().optional(),
  title: z.string().trim().min(1).max(140),
  category: z.string().trim().min(1).max(80).optional(),
  icon: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().min(1).max(24).optional(),
  currentValue: goalNumber.optional(),
  startValue: goalNumber.optional(),
  targetValue: goalNumber.optional(),
  unit: z.string().trim().max(24).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(["active", "paused", "completed"]).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  metricKey: z.string().trim().min(1).max(60).optional(),
  frequency: goalFrequency.optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: goalTime.nullable().optional(),
  nextAction: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1000).optional()
}).strict();

export const goalUpdateSchema = goalCreateSchema.partial().extend({
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mutationId: z.string().min(8).max(120).optional()
}).strict();

export const goalCheckinSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).strict();

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeZoneSchema = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Неизвестный часовой пояс.");
const weekDaysSchema = z.array(z.number().int().min(1).max(7)).max(7).transform(days => [...new Set(days)].sort());

export const planTaskCreateSchema = z.object({
  goalId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(1000).optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  dueLocalDate: localDateSchema.nullable().optional(),
  timeZone: timeZoneSchema,
  recurrence: z.enum(["none", "daily", "weekdays", "weekly", "custom"]).optional(),
  recurrenceDays: weekDaysSchema.optional(),
  reminderEnabled: z.boolean().optional(),
  reminderMinutesBefore: z.number().int().min(0).max(10080).optional()
}).strict();

export const planTaskUpdateSchema = planTaskCreateSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional()
}).strict();

export const planTaskEventSchema = z.object({
  localDate: localDateSchema,
  status: z.enum(["completed", "skipped"]),
  mutationId: z.string().min(8).max(120)
}).strict();

export const planHabitCreateSchema = z.object({
  goalId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  icon: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().min(1).max(24).optional(),
  scheduleType: z.enum(["daily", "weekdays", "days", "timesPerWeek", "custom"]),
  scheduleDays: weekDaysSchema.optional(),
  targetPerWeek: z.number().int().min(1).max(21).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: goalTime.nullable().optional()
}).strict();

export const planHabitUpdateSchema = planHabitCreateSchema.partial().extend({
  status: z.enum(["active", "paused", "archived"]).optional()
}).strict();

export const planHabitEventSchema = z.object({
  localDate: localDateSchema,
  status: z.enum(["completed", "skipped"]),
  mutationId: z.string().min(8).max(120)
}).strict();

export const planManualProgressSchema = z.object({
  value: goalNumber,
  mutationId: z.string().min(8).max(120),
  localDate: localDateSchema
}).strict();

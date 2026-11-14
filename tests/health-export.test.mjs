import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHealthCsv, buildHealthPdfHtml } from "../src/features/health/healthExport.ts";

const realWeight = { sourceRecordId: "scale:1", metric: "weight", value: 81.2, unit: "kg", origin: "automatic", recordedAt: "2026-11-14T08:00:00Z", localDate: "2026-11-14" };
const demoFat = { sourceRecordId: "scale:1", metric: "bodyFatPercentage", value: 22.4, unit: "percent", origin: "mock", recordedAt: "2026-11-14T08:00:00Z", localDate: "2026-11-14" };

test("CSV export keeps provenance and a stable generated timestamp", () => {
  const csv = buildHealthCsv([realWeight, demoFat], new Date("2026-11-14T10:00:00Z"));
  assert.match(csv, /Вес,81.2,кг,Умные весы,Реальные данные/);
  assert.match(csv, /Процент жира,22.4,%,Умные весы,Демо/);
  assert.match(csv, /2026-11-14T10:00:00.000Z/);
});

test("PDF report distinguishes demo values and contains medical disclaimer", () => {
  const html = buildHealthPdfHtml([realWeight, demoFat], "week", new Date("2026-11-14T10:00:00Z"));
  assert.match(html, /AxMed/);
  assert.match(html, /Демо/);
  assert.match(html, /не является медицинским заключением/);
  assert.match(html, /81,2 кг/);
});

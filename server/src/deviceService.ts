import { randomUUID } from "node:crypto";
import { jwtVerify } from "jose";
import { config } from "./config.js";
import { inTransaction, query } from "./database.js";
import { ApiError } from "./errors.js";
import type { DeviceSyncInput } from "./deviceSchemas.js";

const signingKey = new TextEncoder().encode(config.JWT_SECRET);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireDeviceUser(authorization?: string) {
  if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "UNAUTHORIZED", "Войдите в аккаунт.");
  let userId: string;
  let sessionId: string;
  try {
    const { payload } = await jwtVerify(authorization.slice(7), signingKey, {
      algorithms: ["HS256"], issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE
    });
    if (typeof payload.sub !== "string" || !uuid.test(payload.sub) || typeof payload.sid !== "string" || !uuid.test(payload.sid)) throw new Error();
    userId = payload.sub;
    sessionId = payload.sid;
  } catch { throw new ApiError(401, "UNAUTHORIZED", "Сессия истекла. Войдите снова."); }
  const active = await query(`SELECT 1 FROM refresh_tokens WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`, [sessionId, userId]);
  if (!active.rowCount) throw new ApiError(401, "UNAUTHORIZED", "Сессия истекла. Войдите снова.");
  return userId;
}

export async function saveDeviceReadings(userId: string, input: DeviceSyncInput) {
  return inTransaction(async client => {
    const device = await client.query<{ id: string }>(`
      INSERT INTO health_devices (id, user_id, adapter_id, external_id, kind, name, time_zone)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, adapter_id, external_id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id`, [randomUUID(), userId, input.device.adapterId, input.device.id, input.device.kind, input.device.name, input.timeZone]);
    const deviceId = device.rows[0]!.id;
    // Parameterized bulk UPSERT: retries and overlap never double-count steps.
    const unique = [...new Map(input.samples.map(sample => [`${sample.metric}:${sample.sourceRecordId}`, sample])).values()];
    for (let index = 0; index < unique.length; index += 250) {
      const values: unknown[] = [];
      const rows = unique.slice(index, index + 250).map(sample => {
        const offset = values.length;
        values.push(deviceId, sample.sourceRecordId, sample.metric, sample.value, sample.unit,
          sample.recordedAt, sample.periodEnd ?? null, sample.localDate, input.readAt, sample.aggregation ?? null, sample.origin ?? null);
        return `(${Array.from({ length: 11 }, (_, index) => `$${offset + index + 1}`).join(",")})`;
      });
      await client.query(`INSERT INTO device_readings
        (device_id, source_record_id, metric, value, unit, recorded_at, period_end, local_date, source_read_at, aggregation, origin)
        VALUES ${rows.join(",")}
        ON CONFLICT (device_id, metric, source_record_id) DO UPDATE SET
          value = EXCLUDED.value, unit = EXCLUDED.unit, recorded_at = EXCLUDED.recorded_at,
          period_end = EXCLUDED.period_end, local_date = EXCLUDED.local_date, source_read_at = EXCLUDED.source_read_at,
          aggregation = EXCLUDED.aggregation, origin = EXCLUDED.origin
        WHERE device_readings.source_read_at <= EXCLUDED.source_read_at`, values);
    }
    if (input.complete) {
      await client.query(`UPDATE health_devices SET last_sync_at = now(), last_read_at = $2, time_zone = $3, battery = $4,
        sync_version = $5, sync_warnings = $6
        WHERE id = $1 AND (last_read_at IS NULL OR last_read_at <= $2)`,
      [deviceId, input.readAt, input.timeZone, input.battery ? JSON.stringify(input.battery) : null,
        input.syncVersion ?? 1, JSON.stringify(input.warnings ?? [])]);
    }
    return { accepted: unique.length, complete: input.complete };
  });
}

export async function loadDeviceReadings(userId: string) {
  const devices = await query(`SELECT * FROM health_devices WHERE user_id = $1 AND last_read_at IS NOT NULL ORDER BY last_sync_at DESC LIMIT 1`, [userId]);
  const device = devices.rows[0];
  if (!device) return null;
  const readings = await query(`SELECT source_record_id AS "sourceRecordId", metric, value, unit, aggregation, origin,
    recorded_at AS "recordedAt", period_end AS "periodEnd", to_char(local_date, 'YYYY-MM-DD') AS "localDate"
    FROM device_readings WHERE device_id = $1 AND recorded_at >= $2::timestamptz - interval '8 days'
    ORDER BY recorded_at DESC, metric, source_record_id LIMIT 60000`, [device.id, device.last_read_at]);
  return {
    device: { id: device.external_id, name: device.name, adapterId: device.adapter_id, kind: device.kind },
    readAt: device.last_read_at.toISOString(), timeZone: device.time_zone, historyDays: 7, skippedRecords: 0,
    syncVersion: device.sync_version ?? 1, warnings: device.sync_warnings ?? [],
    ...(device.battery ? { battery: device.battery } : {}),
    samples: readings.rows.map(row => ({ ...row, aggregation: row.aggregation ?? undefined, origin: row.origin ?? undefined, recordedAt: row.recordedAt.toISOString(),
      periodEnd: row.periodEnd ? row.periodEnd.toISOString() : undefined }))
  };
}

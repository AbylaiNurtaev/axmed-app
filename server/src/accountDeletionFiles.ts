import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config.js";
import { query } from "./database.js";

let running = false;
const prefixPattern = /^users\/[0-9a-f-]{36}\/profile\/$/i;

// A new generation must survive a worker finishing an older cleanup of the
// same prefix, for example when an avatar upload completes after deletion.
export const queueAccountPhotoCleanupSql = `INSERT INTO account_deletion_file_jobs (id, object_prefix) VALUES ($1, $2)
  ON CONFLICT (object_prefix) DO UPDATE SET id = EXCLUDED.id, retry_after = now(), attempts = 0`;

export async function purgeExpiredSecurityCounters() {
  await query("DELETE FROM login_attempts WHERE window_started_at < now() - interval '30 days' AND (blocked_until IS NULL OR blocked_until < now())");
  await query("DELETE FROM password_reset_requests WHERE greatest(window_started_at, last_sent_at) < now() - interval '30 days'");
}

export async function processAccountDeletionFiles() {
  if (running || !config.AWS_BUCKET_NAME || !config.AWS_S3_REGION || !config.AWS_ACCESS_KEY || !config.AWS_SECRET_KEY) return;
  running = true;
  const s3 = new S3Client({ region: config.AWS_S3_REGION, maxAttempts: 2,
    credentials: { accessKeyId: config.AWS_ACCESS_KEY, secretAccessKey: config.AWS_SECRET_KEY } });
  try {
    // Claim work in a single short statement. No database locks span S3 calls.
    const jobs = await query<{ id: string; object_prefix: string }>(`UPDATE account_deletion_file_jobs
      SET retry_after = now() + interval '10 minutes', attempts = attempts + 1
      WHERE id IN (SELECT id FROM account_deletion_file_jobs WHERE retry_after <= now()
        ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING id, object_prefix`);
    for (const job of jobs.rows) {
      try {
        if (!prefixPattern.test(job.object_prefix)) throw new Error("Invalid account storage prefix");
        let continuation: string | undefined;
        do {
          const listed = await s3.send(new ListObjectsV2Command({ Bucket: config.AWS_BUCKET_NAME, Prefix: job.object_prefix, ContinuationToken: continuation }));
          const objects = (listed.Contents ?? []).flatMap(item => item.Key ? [{ Key: item.Key }] : []);
          if (objects.length) {
            const deleted = await s3.send(new DeleteObjectsCommand({ Bucket: config.AWS_BUCKET_NAME, Delete: { Objects: objects, Quiet: true } }));
            if (deleted.Errors?.length) throw new Error("Storage cleanup incomplete");
          }
          continuation = listed.IsTruncated ? listed.NextContinuationToken : undefined;
          if (listed.IsTruncated && !continuation) throw new Error("Storage pagination incomplete");
        } while (continuation);
        await query("DELETE FROM account_deletion_file_jobs WHERE id = $1", [job.id]);
      } catch {
        // Retain the job for retry. Never log object paths or account details.
        console.error("Account photo cleanup will be retried");
      }
    }
  } finally { s3.destroy(); running = false; }
}

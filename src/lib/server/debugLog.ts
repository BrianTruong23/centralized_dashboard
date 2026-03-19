import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), '.debug');

export async function writeDebugLog(fileName: string, event: string, details?: Record<string, unknown>) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    event,
    details: details ?? null,
  });

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(path.join(LOG_DIR, path.basename(fileName)), `${line}\n`, 'utf8'); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  } catch {
    // Debug logging must never break production request handling.
  }
}

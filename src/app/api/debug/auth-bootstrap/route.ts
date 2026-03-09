import { appendFile, mkdir } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

const LOG_DIR = path.join(process.cwd(), '.debug');
const LOG_FILE = path.join(LOG_DIR, 'auth-bootstrap.log');

export async function POST(req: Request) {
  try {
    const body = await req.text();
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, `${body}\n`, 'utf8');
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to write debug log';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

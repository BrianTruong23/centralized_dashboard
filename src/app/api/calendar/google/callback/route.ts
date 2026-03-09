import { NextResponse } from 'next/server';
import { readOAuthState } from '@/lib/calendar/security';

function redirectWithStatus(
  origin: string,
  returnTo: string,
  status: 'connected' | 'error',
  message?: string,
  code?: string
) {
  const url = new URL(returnTo, origin);
  url.searchParams.set('calendar_status', status);
  if (message) url.searchParams.set('calendar_message', message);
  if (code) url.searchParams.set('calendar_code', code);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (!state) {
    return redirectWithStatus(url.origin, '/', 'error', 'Missing OAuth state.');
  }

  let parsedState: ReturnType<typeof readOAuthState>;
  try {
    parsedState = readOAuthState(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid OAuth state.';
    return redirectWithStatus(url.origin, '/', 'error', message);
  }

  if (error) {
    return redirectWithStatus(url.origin, parsedState.r, 'error', 'Calendar connection was not approved.');
  }

  if (!code) {
    return redirectWithStatus(url.origin, parsedState.r, 'error', 'Missing authorization code.');
  }

  return redirectWithStatus(url.origin, parsedState.r, 'connected', undefined, code);
}

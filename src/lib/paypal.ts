export type PaypalMode = 'sandbox' | 'live';

export function getPaypalBaseUrl(mode: PaypalMode): string {
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export function resolvePaypalMode(value?: string | null): PaypalMode {
  return value === 'live' ? 'live' : 'sandbox';
}

import { getPaypalBaseUrl, resolvePaypalMode } from './paypal';

describe('paypal helpers', () => {
  it('resolves sandbox mode by default', () => {
    expect(resolvePaypalMode(undefined)).toBe('sandbox');
    expect(resolvePaypalMode(null)).toBe('sandbox');
    expect(resolvePaypalMode('anything')).toBe('sandbox');
  });

  it('resolves live mode explicitly', () => {
    expect(resolvePaypalMode('live')).toBe('live');
  });

  it('returns correct base URL per mode', () => {
    expect(getPaypalBaseUrl('sandbox')).toBe('https://api-m.sandbox.paypal.com');
    expect(getPaypalBaseUrl('live')).toBe('https://api-m.paypal.com');
  });
});

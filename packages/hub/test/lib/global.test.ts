import { getDefaultHub, getHubFromCarrier, Hub } from '../../src';

describe('global', () => {
  test('getGlobalHub', () => {
    expect(getDefaultHub()).toBeTruthy();
    expect((global as any).__SENTRY__.hub).toBeTruthy();
  });

  test('getHubFromCarrier', () => {
    const bla = { a: 'b' };
    getHubFromCarrier(bla);
    expect((bla as any).__SENTRY__.hub).toBeTruthy();
    expect((bla as any).__SENTRY__.hub).toBe((bla as any).__SENTRY__.hub);
    getHubFromCarrier(bla);
  });

  test('getGlobalHub', () => {
    const newestHub = new Hub(undefined, [], 999999);
    (global as any).__SENTRY__.hub = newestHub;
    expect(getDefaultHub()).toBe(newestHub);
  });
});

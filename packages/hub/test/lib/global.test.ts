import { getGlobalHub, getHubFromCarrier, Hub } from '../../src';

describe('global', () => {
  test('getGlobalHub', () => {
    expect(getGlobalHub()).toBeTruthy();
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
    const newestHub = new Hub([], 999999);
    (global as any).__SENTRY__.hub = newestHub;
    expect(getGlobalHub()).toBe(newestHub);
  });
});

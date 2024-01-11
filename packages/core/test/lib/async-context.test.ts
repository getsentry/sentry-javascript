import { getCurrentHub, runWithAsyncContext } from '../../src';

describe('runWithAsyncContext()', () => {
  it('without strategy hubs should be equal', () => {
    runWithAsyncContext(() => {
      // eslint-disable-next-line deprecation/deprecation
      const hub1 = getCurrentHub();
      runWithAsyncContext(() => {
        // eslint-disable-next-line deprecation/deprecation
        const hub2 = getCurrentHub();
        expect(hub1).toBe(hub2);
      });
    });
  });
});

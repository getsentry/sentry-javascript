import { getCurrentHub, runWithAsyncContext } from '../../src';

describe('runWithAsyncContext()', () => {
  it('without strategy hubs should be equal', () => {
    runWithAsyncContext(() => {
      const hub1 = getCurrentHub();
      runWithAsyncContext(() => {
        const hub2 = getCurrentHub();
        expect(hub1).toBe(hub2);
      });
    });
  });
});

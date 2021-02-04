import { Integrations } from '../src/index.bundle';
import { testOnlyIfNodeVersionAtLeast } from './testutils';

describe('Integrations export', () => {
  // TODO `Object.values` doesn't work on Node < 8
  testOnlyIfNodeVersionAtLeast(8)('is exported correctly', () => {
    Object.values(Integrations).forEach(integration => {
      expect(integration.id).toStrictEqual(expect.any(String));
    });
  });
});

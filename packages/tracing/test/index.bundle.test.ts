import { Integrations } from '../src/index.bundle';

describe('Integrations export', () => {
  it('is exported correctly', () => {
    Object.values(Integrations).forEach(integration => {
      expect(integration.id).toStrictEqual(expect.any(String));
    });
  });
});

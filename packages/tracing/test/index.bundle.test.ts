import { Integrations } from '../src/index.bundle';

describe('Integrations export', () => {
  it('is exported correctly', () => {
    Object.keys(Integrations).forEach(key => {
      expect(Integrations[key as keyof typeof Integrations].id).toStrictEqual(expect.any(String));
    });
  });
});

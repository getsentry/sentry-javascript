import { Integrations } from '../src/index.bundle';

describe('Integrations export', () => {
  it('is exported correctly', () => {
    Object.keys(Integrations).forEach(key => {
      // Skip BrowserTracing because it doesn't have a static id field.
      if (key === 'BrowserTracing') {
        return;
      }

      expect(Integrations[key as keyof Omit<typeof Integrations, 'BrowserTracing'>].id).toStrictEqual(
        expect.any(String),
      );
    });
  });
});

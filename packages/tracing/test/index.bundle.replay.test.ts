import Sentry from '../src/index.bundle.replay';

// Because of the way how we re-export stuff for the replay bundle, we only have a single default export
const { Integrations } = Sentry;

describe('Integrations export', () => {
  it('is exported correctly', () => {
    Object.keys(Integrations).forEach(key => {
      // Skip BrowserTracing because it doesn't have a static id field.
      if (key === 'BrowserTracing') {
        return;
      }

      expect((Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(Integrations.Replay).toBeDefined();
  });
});

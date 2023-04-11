import { sentry } from '../../src/vite/sentryVitePlugins';

describe('sentrySvelteKitPlugin', () => {
  it('returns a Vite plugin with name, enforce, and config hook', () => {
    const plugin = sentry();
    expect(plugin).toHaveProperty('name');
    expect(plugin).toHaveProperty('enforce');
    expect(plugin).toHaveProperty('config');
    expect(plugin.name).toEqual('sentry-sveltekit');
    expect(plugin.enforce).toEqual('pre');
  });
});

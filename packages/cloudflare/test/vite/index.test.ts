import { describe, expect, it } from 'vitest';
import { sentryCloudflareVitePlugin } from '../../src/vite/index';

const AUTO_INSTRUMENT_PLUGIN = 'sentry-cloudflare-auto-instrument';

function pluginNames(options?: Parameters<typeof sentryCloudflareVitePlugin>[0]): string[] {
  return sentryCloudflareVitePlugin(options).map(plugin => plugin.name);
}

describe('sentryCloudflareVitePlugin', () => {
  it('enables auto-instrumentation by default', () => {
    expect(pluginNames()).toContain(AUTO_INSTRUMENT_PLUGIN);
  });

  it('omits the auto-instrument plugin when opted out', () => {
    expect(pluginNames({ autoInstrumentation: false })).not.toContain(AUTO_INSTRUMENT_PLUGIN);
  });

  it('returns an inert orchestrion plugin when build-time instrumentation is disabled', () => {
    expect(pluginNames({ buildTimeInstrumentation: false })).toContain('sentry-orchestrion-disabled');
  });
});

import { describe, expect, it } from 'vitest';
import { sentryCloudflareVitePlugin } from '../../src/vite/index';
import { isMastraIntegrationModuleId } from '../../src/vite/mastraObservability';

const PROVIDER_PLUGIN = 'sentry-cloudflare-mastra-observability-provider';

describe('isMastraIntegrationModuleId', () => {
  it('matches the ESM Mastra integration module', () => {
    expect(isMastraIntegrationModuleId('/app/node_modules/@sentry/server-utils/build/esm/integrations/mastra.js')).toBe(
      true,
    );
  });

  it('ignores a trailing query/hash Vite may append', () => {
    expect(
      isMastraIntegrationModuleId('/app/node_modules/@sentry/server-utils/build/esm/integrations/mastra.js?v=abc'),
    ).toBe(true);
  });

  it('normalizes Windows separators', () => {
    expect(
      isMastraIntegrationModuleId('C:\\app\\node_modules\\@sentry\\server-utils\\build\\esm\\integrations\\mastra.js'),
    ).toBe(true);
  });

  it('does not match the CJS build (workers load ESM)', () => {
    expect(isMastraIntegrationModuleId('/app/node_modules/@sentry/server-utils/build/cjs/integrations/mastra.js')).toBe(
      false,
    );
  });

  it('does not match another integration module', () => {
    expect(isMastraIntegrationModuleId('/app/node_modules/@sentry/server-utils/build/esm/integrations/openai.js')).toBe(
      false,
    );
  });

  it('does not match unrelated modules', () => {
    expect(isMastraIntegrationModuleId('/app/node_modules/@mastra/core/dist/index.js')).toBe(false);
  });
});

describe('sentryCloudflareVitePlugin', () => {
  it('always includes the Mastra observability provider plugin', () => {
    expect(sentryCloudflareVitePlugin().map(plugin => plugin.name)).toContain(PROVIDER_PLUGIN);
    // Not gated by auto-instrumentation: it injects into Sentry's own module, not the entry.
    expect(sentryCloudflareVitePlugin({ autoInstrumentation: false }).map(plugin => plugin.name)).toContain(
      PROVIDER_PLUGIN,
    );
  });
});

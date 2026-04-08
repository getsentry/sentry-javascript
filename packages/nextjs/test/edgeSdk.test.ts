import type { Integration } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import * as SentryVercelEdge from '@sentry/vercel-edge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/edge';

// normally this is set as part of the build process, so mock it here
(GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRewriteFramesDistDir: string })._sentryRewriteFramesDistDir = '.next';

const vercelEdgeInit = vi.spyOn(SentryVercelEdge, 'init');

function findIntegrationByName(integrations: Integration[] = [], name: string): Integration | undefined {
  return integrations.find(integration => integration.name === name);
}

describe('Edge init()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inits the Vercel Edge SDK', () => {
    expect(vercelEdgeInit).toHaveBeenCalledTimes(0);
    init({});
    expect(vercelEdgeInit).toHaveBeenCalledTimes(1);
    expect(vercelEdgeInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nextjs',
            version: expect.any(String),
            packages: [
              {
                name: 'npm:@sentry/nextjs',
                version: expect.any(String),
              },
              {
                name: 'npm:@sentry/vercel-edge',
                version: expect.any(String),
              },
            ],
          },
        },
        // Integrations are tested separately, and we can't be more specific here without depending on the order in
        // which integrations appear in the array, which we can't guarantee.
        defaultIntegrations: expect.any(Array),
      }),
    );
  });

  describe('integrations', () => {
    // Options passed by `@sentry/nextjs`'s `init` to `@sentry/vercel-edge`'s `init` after modifying them
    type ModifiedInitOptions = { integrations?: Integration[]; defaultIntegrations: Integration[] };

    it('adds default integrations', () => {
      init({});

      const vercelEdgeInitOptions = vercelEdgeInit.mock.calls[0]?.[0] as ModifiedInitOptions;
      const integrationNames = vercelEdgeInitOptions.defaultIntegrations.map(integration => integration.name);

      expect(integrationNames).toContain('DistDirRewriteFrames');
    });

    it('supports passing unrelated integrations through options', () => {
      init({ integrations: [SentryVercelEdge.dedupeIntegration()] });

      const vercelEdgeInitOptions = vercelEdgeInit.mock.calls[0]?.[0] as ModifiedInitOptions;
      const dedupeIntegration = findIntegrationByName(vercelEdgeInitOptions.integrations, 'Dedupe');

      expect(dedupeIntegration).toBeDefined();
    });
  });

  describe('environment option', () => {
    const originalEnv = process.env.SENTRY_ENVIRONMENT;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.SENTRY_ENVIRONMENT = originalEnv;
      } else {
        delete process.env.SENTRY_ENVIRONMENT;
      }
    });

    it('uses environment from options when provided', () => {
      delete process.env.SENTRY_ENVIRONMENT;

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        environment: 'custom-env',
      });

      expect(vercelEdgeInit).toHaveBeenCalledTimes(1);
      const callArgs = vercelEdgeInit.mock.calls[0]?.[0];
      expect(callArgs?.environment).toBe('custom-env');
    });

    it('uses SENTRY_ENVIRONMENT env var when options.environment is not provided', () => {
      process.env.SENTRY_ENVIRONMENT = 'env-from-variable';

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      expect(vercelEdgeInit).toHaveBeenCalledTimes(1);
      const callArgs = vercelEdgeInit.mock.calls[0]?.[0];
      expect(callArgs?.environment).toBe('env-from-variable');
    });

    it('uses fallback environment when neither options.environment nor SENTRY_ENVIRONMENT is provided', () => {
      delete process.env.SENTRY_ENVIRONMENT;

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      });

      expect(vercelEdgeInit).toHaveBeenCalledTimes(1);
      const callArgs = vercelEdgeInit.mock.calls[0]?.[0];
      // In test environment, it should be undefined since we only set it explicitly when SENTRY_ENVIRONMENT is present
      // Note: The underlying vercel-edge SDK may set its own default
      expect(callArgs?.environment).toBeDefined();
    });

    it('prioritizes options.environment over SENTRY_ENVIRONMENT env var', () => {
      process.env.SENTRY_ENVIRONMENT = 'env-from-variable';

      init({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        environment: 'options-env',
      });

      expect(vercelEdgeInit).toHaveBeenCalledTimes(1);
      const callArgs = vercelEdgeInit.mock.calls[0]?.[0];
      expect(callArgs?.environment).toBe('options-env');
    });
  });
});

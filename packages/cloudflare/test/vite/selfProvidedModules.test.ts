import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/server-utils/orchestrion/vite', () => ({
  sentryOrchestrionPlugin: vi.fn(() => ({ name: 'code-transformer' })),
}));

import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { sentryCloudflareVitePlugin } from '../../src/vite/index';

describe('sentryCloudflareVitePlugin', () => {
  it('has `@flue/runtime` provide its own namespace', () => {
    sentryCloudflareVitePlugin({ autoInstrumentation: false });

    expect(sentryOrchestrionPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ selfProvidedModules: ['@flue/runtime'] }),
    );
  });
});

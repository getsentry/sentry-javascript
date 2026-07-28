import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryEsbuildPlugin } from '../../src/bundler-plugin/esbuild';
import { sentryRollupPlugin } from '../../src/bundler-plugin/rollup';
import { sentryVitePlugin } from '../../src/bundler-plugin/vite';
import { sentryWebpackPlugin } from '../../src/bundler-plugin/webpack';

const orchestrionVite = vi.fn(() => ({ name: 'sentry-orchestrion-vite' }));
const orchestrionRollup = vi.fn(() => ({ name: 'sentry-orchestrion-rollup' }));
const orchestrionEsbuildSetup = vi.fn();
const orchestrionWebpackApply = vi.fn();

vi.mock('@sentry/bundler-plugins/vite', () => ({ sentryVitePlugin: () => [{ name: 'sentry-vite' }] }));
vi.mock('@sentry/bundler-plugins/rollup', () => ({ sentryRollupPlugin: () => [{ name: 'sentry-rollup' }] }));
vi.mock('@sentry/bundler-plugins/esbuild', () => ({
  sentryEsbuildPlugin: () => ({ name: 'sentry-esbuild', setup: vi.fn() }),
}));
vi.mock('@sentry/bundler-plugins/webpack', () => ({ sentryWebpackPlugin: () => ({ apply: vi.fn() }) }));

vi.mock('@sentry/server-utils/orchestrion/vite', () => ({ sentryOrchestrionPlugin: () => orchestrionVite() }));
vi.mock('@sentry/server-utils/orchestrion/rollup', () => ({ sentryOrchestrionPlugin: () => orchestrionRollup() }));
vi.mock('@sentry/server-utils/orchestrion/esbuild', () => ({
  sentryOrchestrionPlugin: () => ({ name: 'sentry-orchestrion-esbuild', setup: orchestrionEsbuildSetup }),
}));
vi.mock('@sentry/server-utils/orchestrion/webpack', () => ({
  sentryOrchestrionWebpackPlugin: () => ({ apply: orchestrionWebpackApply }),
}));

describe('@sentry/node bundler plugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('by default (no opt-out)', () => {
    it('vite includes the orchestrion plugin', () => {
      const plugins = sentryVitePlugin();
      expect(plugins.map(p => p.name)).toContain('sentry-orchestrion-vite');
    });

    it('rollup includes the orchestrion plugin', () => {
      const plugins = sentryRollupPlugin();
      expect(plugins.map(p => p.name)).toContain('sentry-orchestrion-rollup');
    });

    it('esbuild runs the orchestrion setup', async () => {
      await sentryEsbuildPlugin().setup({} as never);
      expect(orchestrionEsbuildSetup).toHaveBeenCalledTimes(1);
    });

    it('webpack applies the orchestrion plugin', () => {
      sentryWebpackPlugin().apply({} as never);
      expect(orchestrionWebpackApply).toHaveBeenCalledTimes(1);
    });
  });

  describe('with buildTimeInstrumentation.disable', () => {
    const disabled = { buildTimeInstrumentation: { disable: true } };

    it('vite omits the orchestrion plugin entirely', () => {
      const plugins = sentryVitePlugin(disabled);
      expect(plugins.map(p => p.name)).not.toContain('sentry-orchestrion-vite');
      expect(orchestrionVite).not.toHaveBeenCalled();
    });

    it('rollup omits the orchestrion plugin entirely', () => {
      const plugins = sentryRollupPlugin(disabled);
      expect(plugins.map(p => p.name)).not.toContain('sentry-orchestrion-rollup');
      expect(orchestrionRollup).not.toHaveBeenCalled();
    });

    it('esbuild never runs the orchestrion setup', async () => {
      await sentryEsbuildPlugin(disabled).setup({} as never);
      expect(orchestrionEsbuildSetup).not.toHaveBeenCalled();
    });

    it('webpack never applies the orchestrion plugin', () => {
      sentryWebpackPlugin(disabled).apply({} as never);
      expect(orchestrionWebpackApply).not.toHaveBeenCalled();
    });
  });
});

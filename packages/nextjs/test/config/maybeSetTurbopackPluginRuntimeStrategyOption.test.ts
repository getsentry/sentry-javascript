import { afterEach, describe, expect, it } from 'vitest';
import type { NextConfigObject } from '../../src/config/types';
import { maybeSetTurbopackPluginRuntimeStrategyOption } from '../../src/config/withSentryConfig/getFinalConfigObjectUtils';

const originalVersions = Object.getOwnPropertyDescriptor(process, 'versions')!;

describe('maybeSetTurbopackPluginRuntimeStrategyOption', () => {
  afterEach(() => {
    Object.defineProperty(process, 'versions', originalVersions);
  });

  it.each(['16.2.0', '16.3.8', '17.0.0'])(
    'runs Turbopack loaders in worker threads on Bun with Next.js %s',
    version => {
      Object.defineProperty(process, 'versions', { ...originalVersions, value: { ...process.versions, bun: '1.4.2' } });
      const config: NextConfigObject = {};

      maybeSetTurbopackPluginRuntimeStrategyOption(config, version, true);

      expect(config.experimental).toEqual({ turbopackPluginRuntimeStrategy: 'workerThreads' });
    },
  );

  it('keeps the strategy that the user set', () => {
    Object.defineProperty(process, 'versions', { ...originalVersions, value: { ...process.versions, bun: '1.4.2' } });
    const config: NextConfigObject = { experimental: { turbopackPluginRuntimeStrategy: 'childProcesses' } };

    maybeSetTurbopackPluginRuntimeStrategyOption(config, '16.2.0', true);

    expect(config.experimental).toEqual({ turbopackPluginRuntimeStrategy: 'childProcesses' });
  });

  it.each([
    { name: 'on Node.js', bun: undefined, version: '16.2.0', isTurbopack: true },
    { name: 'with webpack', bun: '1.4.2', version: '16.2.0', isTurbopack: false },
    { name: 'on Next.js 16.1, which does not know the option', bun: '1.4.2', version: '16.1.6', isTurbopack: true },
    { name: 'on Next.js 15', bun: '1.4.2', version: '15.5.4', isTurbopack: true },
    { name: 'without a Next.js version', bun: '1.4.2', version: undefined, isTurbopack: true },
  ])('does not set the strategy $name', ({ bun, version, isTurbopack }) => {
    Object.defineProperty(process, 'versions', { ...originalVersions, value: { ...process.versions, bun } });
    const config: NextConfigObject = {};

    maybeSetTurbopackPluginRuntimeStrategyOption(config, version, isTurbopack);

    expect(config.experimental).toBeUndefined();
  });
});

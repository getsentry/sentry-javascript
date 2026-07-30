import type { InstrumentationConfig } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { describe, expect, it } from 'vitest';
import {
  INSTRUMENTED_MODULE_NAMES,
  instrumentedModuleNames,
  SENTRY_INSTRUMENTATIONS,
  SUBSCRIBE_INJECTIONS,
  withoutInstrumentedExternals,
} from '../../src/orchestrion/config';

describe('orchestrion config — scoped @hapi/hapi module', () => {
  it('includes the scoped @hapi/hapi name in INSTRUMENTED_MODULE_NAMES', () => {
    expect(INSTRUMENTED_MODULE_NAMES).toContain('@hapi/hapi');
  });

  it('strips the scoped package and its subpaths from an externals list', () => {
    // `@hapi/hapi` is the first scoped (slashed) module name in the config, so this
    // exercises `withoutInstrumentedExternals` against a name containing a `/`.
    const external = ['react', '@hapi/hapi', '@hapi/hapi/lib/server.js'];
    expect(withoutInstrumentedExternals(external)).toEqual(['react']);
  });
});

describe('orchestrion config — subscribe injection coverage', () => {
  // Every instrumented library must contribute a subscribe injection so bundler-only SDKs
  // self-register its subscriber. A literal `.length` check is wrong: `toSubscribeInjections`
  // dedupes by (module, versionRange, filePath), so one library with many channel configs
  // (e.g. redis) collapses to fewer injections. The invariant that must hold is at the
  // module-name level — the set of instrumented modules and the set of injected modules match.
  it('has a subscribe injection for every instrumented module and vice versa', () => {
    const instrumentedModules = new Set(SENTRY_INSTRUMENTATIONS.map(i => i.module.name));
    const injectedModules = new Set(SUBSCRIBE_INJECTIONS.map(i => i.module.name));

    expect([...injectedModules].sort()).toEqual([...instrumentedModules].sort());
  });
});

describe('orchestrion config — custom instrumentations', () => {
  const customInstrumentation = { module: { name: 'my-lib' } } as InstrumentationConfig;

  it('includes custom instrumentation module names alongside the defaults', () => {
    const names = instrumentedModuleNames([customInstrumentation]);
    expect(names).toContain('my-lib');
    expect(names).toContain('@hapi/hapi');
  });

  it('strips custom instrumentation packages from an externals list', () => {
    const external = ['react', 'my-lib', 'my-lib/sub'];
    const names = instrumentedModuleNames([customInstrumentation]);
    expect(withoutInstrumentedExternals(external, names)).toEqual(['react']);
  });

  it('leaves custom instrumentation packages externalized when only the defaults are used', () => {
    const external = ['react', 'my-lib'];
    expect(withoutInstrumentedExternals(external)).toEqual(['react', 'my-lib']);
  });
});

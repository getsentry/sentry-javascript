import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { describe, expect, it } from 'vitest';
import {
  INSTRUMENTED_MODULE_NAMES,
  instrumentedModuleNames,
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

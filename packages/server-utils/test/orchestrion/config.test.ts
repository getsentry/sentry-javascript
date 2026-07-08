import { describe, expect, it } from 'vitest';
import { INSTRUMENTED_MODULE_NAMES, withoutInstrumentedExternals } from '../../src/orchestrion/config';

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

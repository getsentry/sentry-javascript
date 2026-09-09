import type { InstrumentationConfig } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { describe, expect, it } from 'vitest';
import {
  INSTRUMENTED_MODULE_NAMES,
  instrumentedModuleNames,
  SENTRY_INSTRUMENTATIONS,
  SENTRY_RUNTIME_INSTRUMENTATIONS,
  withoutInstrumentedExternals,
} from '../../src/orchestrion/config';
import { CHANNEL_INTEGRATION_DEFINITIONS } from '../../src/orchestrion/config/channel-integration-definitions';
import { MODULE_REGISTRATION_TRANSFORM } from '../../src/orchestrion/config/registration-only';

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

describe('orchestrion config — channel-subscriber coverage', () => {
  // The subscribe injection rides the real channel configs (the `tracingChannelImport`
  // override only runs on instrumented files), so a subscriber definition whose module is
  // not instrumented could never self-register — it has to be a config mistake.
  it('only defines subscribers for instrumented modules', () => {
    const instrumentedModules = new Set(SENTRY_INSTRUMENTATIONS.map(i => i.module.name));
    const missing = CHANNEL_INTEGRATION_DEFINITIONS.flatMap(d =>
      d.modules.filter(moduleName => !instrumentedModules.has(moduleName)),
    );

    expect(missing).toEqual([]);
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

describe('orchestrion config — SENTRY_RUNTIME_INSTRUMENTATIONS', () => {
  // The runtime loader has no custom transforms, so a registration-only config
  // (its `transform` is the bundler-only `MODULE_REGISTRATION_TRANSFORM`) throws
  // `transform is not a function` there. These are excluded from the runtime set;
  // the bundler keeps the full `SENTRY_INSTRUMENTATIONS`.
  it('drops every registration-only config and keeps the rest in order', () => {
    // The exclusion is only meaningful if there are registration-only configs to drop.
    const registrationOnly = SENTRY_INSTRUMENTATIONS.filter(c => c.transform === MODULE_REGISTRATION_TRANSFORM);
    expect(registrationOnly.length).toBeGreaterThan(0);

    // None survive into the runtime set...
    expect(SENTRY_RUNTIME_INSTRUMENTATIONS.some(c => c.transform === MODULE_REGISTRATION_TRANSFORM)).toBe(false);

    // ...while every other config is preserved, unchanged and in order.
    expect(SENTRY_RUNTIME_INSTRUMENTATIONS).toEqual(
      SENTRY_INSTRUMENTATIONS.filter(c => c.transform !== MODULE_REGISTRATION_TRANSFORM),
    );
  });

  it('excludes only the native-channel modules, and only via their registration-only config', () => {
    const registrationOnlyModules = [
      ...new Set(
        SENTRY_INSTRUMENTATIONS.filter(c => c.transform === MODULE_REGISTRATION_TRANSFORM).map(c => c.module.name),
      ),
    ].sort();

    expect(registrationOnlyModules).toContain(['@redis/client', 'ai', 'ioredis', 'mongoose', 'mysql2']);

    // The exclusion is per-config, not per-module: a module with both a
    // registration-only (native) config and older transform-based configs keeps
    // the latter at runtime. `ai` (v7 native + v4–6 transforms) is one such case.
    const runtimeAiConfigs = SENTRY_RUNTIME_INSTRUMENTATIONS.filter(c => c.module.name === 'ai');
    expect(runtimeAiConfigs.length).toBeGreaterThan(0);
    expect(runtimeAiConfigs.every(c => c.transform !== MODULE_REGISTRATION_TRANSFORM)).toBe(true);
  });
});

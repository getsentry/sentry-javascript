import { describe, expect, it } from 'vitest';
import { getGlobalValueInjectionCode } from '../../src/vite/injectGlobalValues';

describe('getGlobalValueInjectionCode', () => {
  it('returns code that injects values into the global object', () => {
    const injectionCode = getGlobalValueInjectionCode({
      __sentry_sveltekit_output_dir: '.svelte-kit/output',
      __sentry_sveltekit_tracing_config: {
        tracing: {
          server: true,
        },
        instrumentation: {
          server: true,
        },
      },
    });

    expect(injectionCode).toMatchInlineSnapshot(`
      "globalThis["__sentry_sveltekit_output_dir"] = ".svelte-kit/output";
      globalThis["__sentry_sveltekit_tracing_config"] = {"tracing":{"server":true},"instrumentation":{"server":true}};
      "
    `);

    // Check that the code above is in fact valid and works as expected
    // The return value of eval here is the value of the last expression in the code
    eval(injectionCode);
    expect(globalThis.__sentry_sveltekit_output_dir).toEqual('.svelte-kit/output');
    expect(globalThis.__sentry_sveltekit_tracing_config).toEqual({
      tracing: {
        server: true,
      },
      instrumentation: {
        server: true,
      },
    });

    delete globalThis.__sentry_sveltekit_output_dir;
    delete globalThis.__sentry_sveltekit_tracing_config;
  });

  it('returns empty string if no values are passed', () => {
    expect(getGlobalValueInjectionCode({})).toEqual('');
  });
});

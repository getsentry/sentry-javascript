import { describe, expect, it } from 'vitest';
import { getGlobalValueInjectionCode } from '../../src/vite/injectGlobalValues';

describe('getGlobalValueInjectionCode', () => {
  it('returns code that injects values into the global object', () => {
    const injectionCode = getGlobalValueInjectionCode({
      __sentry_sveltekit_output_dir: '.svelte-kit/output',
    });

    expect(injectionCode).toMatchInlineSnapshot(`
      "globalThis["__sentry_sveltekit_output_dir"] = ".svelte-kit/output";
      "
    `);

    // Check that the code above is in fact valid and works as expected
    // The return value of eval here is the value of the last expression in the code
    eval(injectionCode);
    expect(globalThis.__sentry_sveltekit_output_dir).toEqual('.svelte-kit/output');

    delete globalThis.__sentry_sveltekit_output_dir;
  });

  it('returns empty string if no values are passed', () => {
    expect(getGlobalValueInjectionCode({})).toEqual('');
  });
});

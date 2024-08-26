import { describe, expect, it } from 'vitest';

import { getGlobalValueInjectionCode } from '../../src/vite/injectGlobalValues';

describe('getGlobalValueInjectionCode', () => {
  it('returns code that injects values into the global object', () => {
    const injectionCode = getGlobalValueInjectionCode({
      // @ts-expect-error - just want to test this with multiple values
      something: 'else',
      __sentry_sveltekit_output_dir: '.svelte-kit/output',
    });
    expect(injectionCode).toEqual(`globalThis["something"] = "else";
globalThis["__sentry_sveltekit_output_dir"] = ".svelte-kit/output";
`);

    // Check that the code above is in fact valid and works as expected
    // The return value of eval here is the value of the last expression in the code
    expect(eval(`${injectionCode}`)).toEqual('.svelte-kit/output');

    delete globalThis.__sentry_sveltekit_output_dir;
  });

  it('returns empty string if no values are passed', () => {
    expect(getGlobalValueInjectionCode({})).toEqual('');
  });
});

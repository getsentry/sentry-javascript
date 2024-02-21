import { getGlobalValueInjectionCode } from '../../src/vite/injectGlobalValues';

describe('getGlobalValueInjectionCode', () => {
  it('returns code that injects values into the global object', () => {
    const injectionCode = getGlobalValueInjectionCode({
      // @ts-expect-error - just want to test this with multiple values
      something: 'else',
      __sentry_sveltekit_output_dir: '.svelte-kit/output',
    });
    expect(injectionCode).toEqual(`var _global =
  typeof window !== 'undefined' ?
    window :
    typeof globalThis !== 'undefined' ?
      globalThis :
      typeof global !== 'undefined' ?
        global :
        typeof self !== 'undefined' ?
          self :
          {};
_global["something"] = "else";
_global["__sentry_sveltekit_output_dir"] = ".svelte-kit/output";
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

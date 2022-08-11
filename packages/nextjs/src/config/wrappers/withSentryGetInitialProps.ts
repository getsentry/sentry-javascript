import { GIProps } from './types';

/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGIProps: The user's `getInitialProps` function
 * @param origGIPropsHost: The user's object on which `getInitialProps` lives (used for `this`)
 * @returns A wrapped version of the function
 */
export function withSentryGetInitialProps(origGIProps: GIProps['fn']): GIProps['wrappedFn'] {
  return async function (this: unknown, ...args: Parameters<GIProps['fn']>) {
    return await origGIProps.call(this, ...args);
  };
}

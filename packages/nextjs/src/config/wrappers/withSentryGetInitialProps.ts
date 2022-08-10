import { GIProps } from './types';

// Disclaimer: Keep this file side-effect free. If you have to intruduce a side-effect, make sure it can run on the
// browser and on the server. Reason: This `getInitialProps` wrapper imports this file and `getInitialProps` might run on
// the browser and / or on the server.

/**
 * Create a wrapped version of the user's exported `getInitialProps` function
 *
 * @param origGIProps: The user's `getInitialProps` function
 * @param origGIPropsHost: The user's object on which `getInitialProps` lives (used for `this`)
 * @returns A wrapped version of the function
 */
export function withSentryGetInitialProps(origGIProps: GIProps['fn'] | undefined): GIProps['wrappedFn'] {
  if (typeof origGIProps === 'function') {
    return async function (this: unknown, ...args: Parameters<GIProps['fn']>) {
      return await origGIProps.call(this, ...args);
    };
  } else {
    return origGIProps;
  }
}

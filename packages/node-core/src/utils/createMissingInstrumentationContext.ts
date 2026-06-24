import type { MissingInstrumentationContext } from '@sentry/core';

export const createMissingInstrumentationContext = (pkg: string): MissingInstrumentationContext => {
  let isCjs: boolean;
  /*! rollup-include-cjs-only */
  isCjs = true;
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  isCjs = false;
  /*! rollup-include-esm-only-end */

  return {
    package: pkg,
    'javascript.is_cjs': isCjs,
  };
};

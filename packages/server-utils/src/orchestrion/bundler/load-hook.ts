// The transform for a caller with a file path and its source and no bundler in between. Bundled like
// the webpack loader: the `@apm-js-collab` packages are devDependencies, not resolvable on user installs.
import { createCodeTransformer } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import type { InstrumentationConfig } from '../apmTypes';

export interface LoadHookTransformOptions {
  /**
   * Module specifier the transformed code imports its `tracingChannel` from, in place of
   * `node:diagnostics_channel`. In a browser this is a URL the module loader can fetch.
   */
  dcModule: string;
  /** Defaults to every built in instrumentation. */
  instrumentations?: InstrumentationConfig[];
}

/**
 * Instruments `code` when `filePath` is in an instrumented package, read from the nearest
 * `package.json`. Returns `undefined` when it is not, or the transform fails, so the caller serves the
 * module as is.
 */
export function createLoadHookTransform(
  options: LoadHookTransformOptions,
): (filePath: string, code: string) => string | undefined {
  const { transform } = createCodeTransformer({
    instrumentations: options.instrumentations ?? SENTRY_INSTRUMENTATIONS,
    dcModule: options.dcModule,
  });

  return (filePath, code) => {
    // Only third party modules carry instrumentation configs.
    if (!/[\\/]node_modules[\\/]/.test(filePath)) {
      return undefined;
    }
    try {
      return transform(code, filePath)?.code;
    } catch {
      return undefined;
    }
  };
}

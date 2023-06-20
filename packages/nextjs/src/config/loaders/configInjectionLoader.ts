import * as path from 'path';

import type { LoaderThis } from './types';

type LoaderOptions = {
  sentryConfigFilePath: string;
};

/**
 * Injects `sentry.*.config.ts` and `sentry.*.config.ts` files into user code.
 */
export default function configInjectionLoader(
  this: LoaderThis<LoaderOptions>,
  userCode: string,
  userModuleSourceMap: any,
): void {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { sentryConfigFilePath } = 'getOptions' in this ? this.getOptions() : this.query;

  // We do not want to cache injected inits across builds
  this.cacheable(false);

  this.async();

  // Inject init code from `sentry.*.config` files into the wrapping template
  if (path.isAbsolute(this.resourcePath)) {
    // We check whether `this.resourcePath` is absolute because there is no contract by webpack that says it is absolute,
    // however we can only create relative paths to the sentry config from absolute paths.
    // Examples where this could possibly be non - absolute are virtual modules.
    const sentryConfigImportPath = path
      .relative(path.dirname(this.resourcePath), sentryConfigFilePath) // Absolute paths do not work with Windows: https://github.com/getsentry/sentry-javascript/issues/8133
      .replace(/\\/g, '/');
    this.callback(null, userCode.concat(`;import "${sentryConfigImportPath}";\n`), userModuleSourceMap);
  } else {
    this.callback(null, userCode, userModuleSourceMap);
  }
}

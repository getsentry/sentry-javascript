import type { LoaderThis } from './types';

type LoaderOptions = {
  values: Record<string, unknown>;
};

// We need to be careful not to inject anything before any `"use strict";`s or "use client"s or really any other directive.
// As an additional complication directives may come after any number of comments.
// This regex is shamelessly stolen from: https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/7f984482c73e4284e8b12a08dfedf23b5a82f0af/packages/bundler-plugin-core/src/index.ts#L535-L539
const SKIP_COMMENT_AND_DIRECTIVE_REGEX =
  // Note: CodeQL complains that this regex potentially has n^2 runtime. This likely won't affect realistic files.
  // Rollup doesn't like if we put this regex as a literal (?). No idea why.
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
  new RegExp('^(?:\\s*|/\\*(?:.|\\r|\\n)*?\\*/|//.*[\\n\\r])*(?:"[^"]*";|\'[^\']*\';)?');

/**
 * Set values on the global/window object at the start of a module.
 *
 * Options:
 *   - `values`: An object where the keys correspond to the keys of the global values to set and the values
 *        correspond to the values of the values on the global object. Values must be JSON serializable.
 */
export default function valueInjectionLoader(this: LoaderThis<LoaderOptions>, userCode: string): string {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { values } = 'getOptions' in this ? this.getOptions() : this.query;

  // We do not want to cache injected values across builds
  this.cacheable(false);

  const injectedCode = Object.entries(values)
    .map(([key, value]) => `globalThis["${key}"] = ${JSON.stringify(value)};`)
    .join('\n');

  return userCode.replace(SKIP_COMMENT_AND_DIRECTIVE_REGEX, match => {
    return match + injectedCode;
  });
}

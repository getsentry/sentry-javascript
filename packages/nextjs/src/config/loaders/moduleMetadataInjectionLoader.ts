import type { LoaderThis } from './types';
import { SKIP_COMMENT_AND_DIRECTIVE_REGEX } from './valueInjectionLoader';

export type ModuleMetadataInjectionLoaderOptions = {
  applicationKey: string;
};

/**
 * Inject `_sentryModuleMetadata` into every module so that the
 * `thirdPartyErrorFilterIntegration` can tell first-party code from
 * third-party code.
 *
 * This is the Turbopack equivalent of what `@sentry/webpack-plugin` does
 * via its `moduleMetadata` option.
 *
 * Options:
 *   - `applicationKey`: The application key used to tag first-party modules.
 */
export default function moduleMetadataInjectionLoader(
  this: LoaderThis<ModuleMetadataInjectionLoaderOptions>,
  userCode: string,
): string {
  const { applicationKey } = 'getOptions' in this ? this.getOptions() : this.query;

  // We do not want to cache injected values across builds
  this.cacheable(false);

  // The snippet mirrors what @sentry/webpack-plugin injects for moduleMetadata.
  // We access _sentryModuleMetadata via globalThis (not as a bare variable) to avoid
  // ReferenceError in strict mode. Each module is keyed by its Error stack trace so that
  // the SDK can map filenames to metadata at runtime.
  // Not putting any newlines in the generated code will decrease the likelihood of sourcemaps breaking.
  const metadata = JSON.stringify({ [`_sentryBundlerPluginAppKey:${applicationKey}`]: true });
  const injectedCode =
    ';globalThis._sentryModuleMetadata = globalThis._sentryModuleMetadata || {};' +
    `globalThis._sentryModuleMetadata[(new Error).stack] = Object.assign({}, globalThis._sentryModuleMetadata[(new Error).stack], ${metadata});`;

  return userCode.replace(SKIP_COMMENT_AND_DIRECTIVE_REGEX, match => {
    return match + injectedCode;
  });
}

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
  // It is wrapped in a try-catch IIFE (matching the webpack plugin's CodeInjection pattern)
  // so that injection failures in node_modules or unusual environments never break the module.
  // The IIFE resolves the global object and stores metadata keyed by (new Error).stack
  // so the SDK can map chunk filenames to metadata at runtime.
  // Not putting any newlines in the generated code will decrease the likelihood of sourcemaps breaking.
  const metadata = JSON.stringify({ [`_sentryBundlerPluginAppKey:${applicationKey}`]: true });
  const injectedCode =
    ';!function(){try{' +
    'var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};' +
    'e._sentryModuleMetadata=e._sentryModuleMetadata||{},' +
    `e._sentryModuleMetadata[(new e.Error).stack]=Object.assign({},e._sentryModuleMetadata[(new e.Error).stack],${metadata});` +
    '}catch(e){}}();';

  return userCode.replace(SKIP_COMMENT_AND_DIRECTIVE_REGEX, match => {
    return match + injectedCode;
  });
}

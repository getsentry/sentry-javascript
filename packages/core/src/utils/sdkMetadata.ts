import type { Options } from '../types-hoist/options';
import { SDK_VERSION } from '../utils/version';

/**
 * A builder for the SDK metadata in the options for the SDK initialization.
 *
 * Note: This function is identical to `buildMetadata` in Remix and NextJS and SvelteKit.
 * We don't extract it for bundle size reasons.
 * @see https://github.com/getsentry/sentry-javascript/pull/7404
 * @see https://github.com/getsentry/sentry-javascript/pull/4196
 *
 * If you make changes to this function consider updating the others as well.
 *
 * @param options SDK options object that gets mutated
 * @param names list of package names
 * @param source source of the SDK (npm, cdn, etc)
 * @param setInferIp whether to set the ip inferral setting on the SDK metadata object
 */
export function applySdkMetadata(options: Options, name: string, names = [name], source = 'npm'): void {
  const metadata = options._metadata || {};

  if (!metadata.sdk) {
    metadata.sdk = {
      name: `sentry.javascript.${name}`,
      packages: names.map(name => ({
        name: `${source}:@sentry/${name}`,
        version: SDK_VERSION,
      })),
      version: SDK_VERSION,
    };
  }

  options._metadata = metadata;
}

import type { Integration } from '../types/integration';
import type { CoreOptions } from '../types/options';
import type { SdkMetadata } from '../types/sdkmetadata';
import { uniq } from './array';
import { SDK_VERSION } from '../utils/version';

/**
 * Preserve user-provided option keys before SDK wrappers add defaults.
 * @internal
 */
export function captureOptionsSetByUser<T extends Pick<CoreOptions, '_metadata' | 'integrations'>>(options: T): T {
  if (options._metadata?.optionsSetByUser) {
    return options;
  }

  const { integrations } = options;
  const metadata: SdkMetadata = {
    ...options._metadata,
    optionsSetByUser: Object.keys(options)
      .filter(key => key !== '_metadata')
      .sort(),
  };

  // SDKs merge their defaults into `integrations` before the client gets it.
  if (Array.isArray(integrations)) {
    metadata.integrationsSetByUser = uniq(integrations.map(integration => integration.name));
  }

  return {
    ...options,
    _metadata: metadata,
    // Whatever the function returns is the user's choice, including the defaults it kept.
    ...(typeof integrations === 'function' && {
      integrations: (defaults: Integration[]) => {
        const resolved = integrations(defaults);
        metadata.integrationsSetByUser = uniq(resolved.map(integration => integration.name));

        return resolved;
      },
    }),
  };
}

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
 */
export function applySdkMetadata(options: CoreOptions, name: string, names = [name], source = 'npm'): void {
  const sdk = ((options._metadata = options._metadata || {}).sdk = options._metadata.sdk || {});

  if (!sdk.name) {
    sdk.name = `sentry.javascript.${name}`;
    sdk.packages = names.map(name => ({
      name: `${source}:@sentry/${name}`,
      version: SDK_VERSION,
    }));
    sdk.version = SDK_VERSION;
  }
}

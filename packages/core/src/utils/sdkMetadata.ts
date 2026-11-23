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
    // Report the function as a change to the defaults, the same way the array form reads.
    ...(typeof integrations === 'function' && {
      integrations: (defaults: Integration[]) => {
        const result = integrations(defaults);
        // `getIntegrationsToSetup` also accepts a single integration.
        const resolved: Integration[] = Array.isArray(result) ? result : [result];
        const resolvedNames = new Set(resolved.map(integration => integration.name));
        const removed = uniq(defaults.map(integration => integration.name).filter(name => !resolvedNames.has(name)));
        // SDK wrappers pass their own integrations in with the defaults, without flagging them as default instances.
        const passedIn = new Set(defaults);

        metadata.integrationsSetByUser = uniq(
          resolved
            .filter(
              integration =>
                !passedIn.has(integration) &&
                !(integration as Integration & { isDefaultInstance?: true }).isDefaultInstance,
            )
            .map(integration => integration.name),
        );
        if (removed.length) {
          metadata.removedDefaultIntegrations = removed.sort();
        }

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

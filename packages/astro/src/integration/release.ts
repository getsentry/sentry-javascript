import { resolveReleaseName } from '@sentry/bundler-plugins/core';
import { stringifyForCodeInjection } from '@sentry/core';
import type { VitePlugin } from './cloudflare';
import { WORKER_ENTRY_IDS } from './cloudflare';
import type { SentryOptions } from './types';

const RELEASE_MODULE = 'virtual:@sentry/astro/release';
const RESOLVED_RELEASE_MODULE = `\0${RELEASE_MODULE}`;
const RELEASE_IMPORT = `import "${RELEASE_MODULE}";\n`;

/**
 * The release the integration gives the SDKs instead of the bundler plugin, unless `release.inject` is `false`.
 */
export function getRuntimeRelease(release: SentryOptions['release']): string | undefined {
  return release?.inject !== false ? resolveReleaseName(release?.name) : undefined;
}

/**
 * Sets the global the SDKs read the release from when `Sentry.init` gets none. The integration puts it into the
 * page HTML for the browser, so the release stays out of the content-hashed client chunks.
 */
export function buildReleaseSnippet(release: string): string {
  return `globalThis.SENTRY_RELEASE={id:${stringifyForCodeInjection(release)}};`;
}

/**
 * Sets the release global at the start of every server entry, before anything that could call `Sentry.init`.
 * It replaces the bundler plugin's release injection, which can't be turned off for the client build alone.
 */
export function makeServerReleaseVitePlugin(release: string): VitePlugin {
  return {
    name: 'sentry-astro-server-release',
    // Runs after the other plugins that prepend imports to the entries, so this import comes first.
    enforce: 'post',
    resolveId: id => (id === RELEASE_MODULE ? RESOLVED_RELEASE_MODULE : null),
    load: id => (id === RESOLVED_RELEASE_MODULE ? buildReleaseSnippet(release) : null),
    transform(code, id, options) {
      if (!options?.ssr) {
        return null;
      }

      const isEntry = this.getModuleInfo(id)?.isEntry || WORKER_ENTRY_IDS.some(entryId => id.includes(entryId));
      return isEntry ? { code: RELEASE_IMPORT + code, map: null } : null;
    },
  };
}

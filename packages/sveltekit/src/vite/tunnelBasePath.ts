import { escapeStringForRegex } from '@sentry/core';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { TUNNEL_BASE_PATH_GLOBAL } from '../common/tunnel';
import type { ResolvedKitConfig } from './kitConfig';
import { getHooksFileName } from './svelteConfig';

const VIRTUAL_BASE_PATH_FILE = '\0sentry-sveltekit-tunnel-base-path';

/**
 * Hands the app's `paths.base` to the client and server SDKs so `tunnel: true` works under a base path without
 * the user repeating it. It's imported first in the hooks files, so it's set before any `init` they import.
 */
export function makeTunnelBasePathPlugin(getKitConfig: () => Promise<ResolvedKitConfig>): Plugin {
  let basePath = '';
  let entryFileRegexp: RegExp | undefined;

  return {
    name: 'sentry-sveltekit-tunnel-base-path',

    configResolved: async () => {
      const kitConfig = await getKitConfig();
      basePath = kitConfig.paths?.base || '';

      const hooksFiles = [getHooksFileName(kitConfig, 'server'), getHooksFileName(kitConfig, 'client')]
        .map(escapeStringForRegex)
        .join('|');
      // oxlint-disable-next-line sdk/no-regexp-constructor -- not end user input + escaped anyway
      entryFileRegexp = new RegExp(`/(?:${hooksFiles}|src/instrumentation\\.server)\\.(?:js|ts|mjs|mts)$`);
    },

    resolveId: id => (id === VIRTUAL_BASE_PATH_FILE ? id : null),

    load: id =>
      id === VIRTUAL_BASE_PATH_FILE
        ? `globalThis[${JSON.stringify(TUNNEL_BASE_PATH_GLOBAL)}] = ${JSON.stringify(basePath)};`
        : null,

    transform: (code, id) => {
      if (!basePath || !entryFileRegexp?.test(id)) {
        return null;
      }

      const ms = new MagicString(code);
      ms.prepend(`import ${JSON.stringify(VIRTUAL_BASE_PATH_FILE)};\n`);

      return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
    },
  };
}

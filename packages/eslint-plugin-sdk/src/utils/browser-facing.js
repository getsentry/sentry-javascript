'use strict';

/**
 * Which parts of which package are browser-facing.
 *
 * `true` means the package's whole `src` (plus `addon`, for ember) ships to the browser. An array
 * lists the paths that do, for packages that also contain server, edge or build-time code.
 *
 * `core` is not listed: it is shared with server runtimes, so whether it counts depends on the rule.
 */
const BROWSER_FACING = {
  angular: true,
  browser: true,
  'browser-utils': true,
  ember: true,
  feedback: true,
  gatsby: true,
  react: true,
  'replay-canvas': true,
  'replay-internal': true,
  solid: true,
  svelte: true,
  vue: true,
  wasm: true,

  astro: ['src/client'],
  effect: ['src/client'],
  nextjs: ['src/client'],
  nuxt: ['src/client'],
  'react-router': ['src/client'],
  remix: ['src/client'],
  solidstart: ['src/client'],
  sveltekit: ['src/client'],
  'tanstackstart-react': ['src/client'],
};

/** Resolve `<package>` and the package-relative path out of a file path. */
function splitPackagePath(filename) {
  const match = /(?:^|\/)packages\/([^/]+)\/(.+)$/.exec(filename.replace(/\\/g, '/'));
  return match ? { pkg: match[1], path: match[2] } : undefined;
}

function isBrowserFacing(filename) {
  const location = splitPackagePath(filename);
  if (!location) {
    return false;
  }

  const scope = BROWSER_FACING[location.pkg];
  if (!scope) {
    return false;
  }

  if (scope === true) {
    return location.path.startsWith('src/') || location.path.startsWith('addon/');
  }

  return scope.some(prefix => location.path === prefix || location.path.startsWith(`${prefix}/`));
}

module.exports = { splitPackagePath, isBrowserFacing };

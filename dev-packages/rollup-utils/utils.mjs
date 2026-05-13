/**
 * Helper function to compensate for the fact that JS can't handle negative array indices very well
 */
export const insertAt = (arr, index, ...insertees) => {
  const newArr = [...arr];
  // Add 1 to the array length so that the inserted element ends up in the right spot with respect to the length of the
  // new array (which will be one element longer), rather than that of the current array
  const destinationIndex = index >= 0 ? index : arr.length + 1 + index;
  newArr.splice(destinationIndex, 0, ...insertees);
  return newArr;
};

/**
 * Turn a list of module IDs into a test function
 * Includes submodule exports by checking that it starts with the name
 * plus a / character. The list would contain something like `'@sentry/core'`
 * and we might test it against a module id like `'@sentry/core/browser'`
 */
const toFilterFunction = list => (Array.isArray(list) ? id => list.some(test => filterTest(test, id)) : list);

const filterTest = (test, id) => (test instanceof RegExp ? test.test(id) : id === test || id.startsWith(`${test}/`));

/**
 * Merge two external configs (function or array), returning a function that handles both.
 */
export function mergeExternals(base, specific) {
  const baseFn = toFilterFunction(base);
  const specificFn = toFilterFunction(specific);
  return id => baseFn(id) || specificFn(id);
}

/**
 * Merge two arrays of plugins, making sure they're sorted in the correct order.
 *
 * Each entry below is pinned for a real reason; `...` is where every other plugin lands.
 * Plugins that depend on **comments** in the source MUST run before `esbuild`, because
 * esbuild strips non-legal block comments during transpile.
 *
 *  - `remove-dev-mode-blocks` (transform) — strips `/* rollup-include-development-only *\/`
 *    marker blocks. Comment-dependent → must precede `esbuild`.
 *  - `replace-sdk-source` (transform) — rewrites the `/* __SENTRY_SDK_SOURCE__ *\/`
 *    marker in `getSDKSource()` for CDN builds. Comment-dependent → must precede `esbuild`.
 *  - `esbuild` (transform) — TS/JSX → JS. Everything in `...` runs after this.
 *  - `terser` (renderChunk) — minifies and strips comments (we use `comments: false`).
 *    Anything that contributes code to a chunk must run before this.
 *  - `license` (renderChunk) — prepends the license banner, which is a comment. Must run
 *    AFTER `terser`, otherwise terser would strip it.
 *  - `output-base64-worker-script` (renderChunk) — captures the final chunk text as
 *    base64, so it must run last.
 */
export function mergePlugins(pluginsA, pluginsB) {
  const order = [
    'remove-dev-mode-blocks',
    'replace-sdk-source',
    'esbuild',
    '...',
    'terser',
    'license',
    'output-base64-worker-script',
  ];
  const plugins = [...pluginsA, ...pluginsB];
  plugins.sort((a, b) => {
    const sortKeyA = order.includes(a.name) ? a.name : '...';
    const sortKeyB = order.includes(b.name) ? b.name : '...';
    return order.indexOf(sortKeyA) - order.indexOf(sortKeyB);
  });
  return plugins;
}

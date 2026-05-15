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
 * Each entry in `order` is pinned for a real reason; `...` is where every other plugin lands.
 */
export function mergePlugins(pluginsA, pluginsB) {
  const order = [
    // (transform) Strips `/*! rollup-include-development-only */` marker blocks. Must precede `esbuild` so the
    // now-unused imports inside the block can be tree-shaken by rollup.
    'remove-dev-mode-blocks',
    // (transform) Rewrites the `/*! __SENTRY_SDK_SOURCE__ */` comment marker in `getSDKSource()` for CDN builds.
    // Comment-based → must precede `esbuild` (the marker uses `/*!` legal-comment syntax, but pinning is defensive).
    'replace-sdk-source',
    // (transform) TS/JSX → JS, strips non-legal block comments, strips `declare const` lines.
    'esbuild',
    // The identifier-based `replace-*` plugins below MUST run AFTER `esbuild`. Each of these identifiers is also
    // declared in TS via `declare const __FOO__: ...;` lines. If the replace runs before esbuild, it rewrites the
    // declaration's identifier into an expression and produces invalid TS. esbuild strips `declare const` lines,
    // so by the time these plugins run the only remaining occurrences are real references.
    'replace-debug-build-statement',
    'replace-browser-bundle-flag',
    'replace-debug-flags',
    'replace-rrweb-build-flags',
    // Every other plugin lands here — including additional identifier-based `replace-*` plugins (e.g.
    // `replace-sdk-version`), which intentionally run AFTER `esbuild` for the same reason as the ones pinned above.
    '...',
    // (renderChunk) Minifies and strips comments (we use `comments: false`). Anything that contributes code to a
    // chunk must run before this.
    'terser',
    // (renderChunk) Prepends the license banner, which is a comment. Must run AFTER `terser`, otherwise terser
    // would strip it.
    'license',
    // (renderChunk) Captures the final chunk text as base64, so it must run last.
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

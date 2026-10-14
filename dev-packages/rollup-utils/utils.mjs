import { builtinModules } from 'module';

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
 *
 * Rolldown's builtin plugins all report the same `name` (e.g. `builtin:replace`), so they can't be
 * pinned individually and all land in `...`, where `Array.prototype.sort` keeps them in insertion
 * order. That's fine: the transpile step they used to be ordered against is now part of rolldown
 * itself and always runs first.
 */
export function mergePlugins(pluginsA, pluginsB) {
  const order = [
    // (transform) Strips `/*! rollup-include-development-only */` marker blocks. Runs first so the
    // now-unused imports inside the block can be tree-shaken.
    'remove-dev-mode-blocks',
    // (transform) Strips the marker blocks for the format we're not currently emitting.
    'remove-esm-cjs-mode-blocks',
    // Every other plugin lands here, including the identifier-based `builtin:replace` instances.
    '...',
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

/**
 * Rolldown has no `'smallest'` treeshake preset, so spell out what rollup's `'smallest'` meant.
 *
 * https://rolldown.rs/options/treeshake#treeshake
 * https://rollupjs.org/configuration-options/#treeshake
 */
export function treeShakePreset(preset) {
  if (preset === 'smallest') {
    return {
      propertyReadSideEffects: false,
      moduleSideEffects: false,
      unknownGlobalSideEffects: false,
    };
  }

  return preset;
}

/**
 * List every Node.js builtin under both its bare name (`fs`) and its prefixed name (`node:fs`).
 *
 * Rollup normalised the `node:` prefix for us when matching externals; rolldown doesn't, so both
 * spellings have to be listed explicitly.
 */
export function getNodeBuiltIns(excludeBuiltins = []) {
  const excluded = new Set(excludeBuiltins);

  return builtinModules.flatMap(builtin => (excluded.has(builtin) ? [] : [builtin, `node:${builtin}`]));
}

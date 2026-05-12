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
 */
export function mergePlugins(pluginsA, pluginsB) {
  const plugins = [...pluginsA, ...pluginsB];
  plugins.sort((a, b) => {
    // Hacky way to make sure the ones we care about end up where they belong in the order. Really the TS and sucrase
    // plugins are tied - both should come first - but they're mutually exclusive, so they can come in arbitrary order
    // here.
    // Additionally, the excludeReplay plugin must run before TS/Sucrase so that we can eliminate the replay code
    // before anything is type-checked (TS-only) and transpiled.
    const order = ['remove-dev-mode-blocks', 'excludeReplay', '...', 'output-base64-worker-script'];
    const sortKeyA = order.includes(a.name) ? a.name : '...';
    const sortKeyB = order.includes(b.name) ? b.name : '...';

    return order.indexOf(sortKeyA) - order.indexOf(sortKeyB);
  });

  return plugins;
}

/**
 * Creates a treeshake setting preset, rolldown doesn't have "smallest" as a preset, so we need to create our own.
 * Smallest
 * https://rolldown.rs/options/treeshake#treeshake
 * https://rollupjs.org/configuration-options/#treeshake
 * @param {boolean | readonly string[] | ModuleSideEffectsRule[] | ((id: string, external: boolean) => boolean | undefined) | 'no-external' | 'smallest'} preset - The preset to use
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
 * Get a set of all Node.js built-in module names, including both bare names (e.g. "fs") and "node:" prefixed names (e.g. "node:fs").
 */
export function getNodeBuiltIns(excludeBuiltins = []) {
  const excludeBuiltinsSet = new Set(excludeBuiltins);
  const builtIns = [];
  for (const builtin of builtinModules) {
    if (excludeBuiltinsSet.has(builtin)) {
      continue;
    }

    builtIns.push(builtin);
    builtIns.push(`node:${builtin}`);
  }

  return builtIns;
}

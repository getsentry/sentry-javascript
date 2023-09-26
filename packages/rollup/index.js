Error.stackTraceLimit = Infinity;

// TODO Is this necessary?
import * as plugins from './plugins/index.js';
export { plugins };

export * from './bundleHelpers.js';
export * from './npmHelpers.js';
export { insertAt } from './utils.js';

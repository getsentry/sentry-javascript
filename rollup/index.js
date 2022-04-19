Error.stackTraceLimit = Infinity;

// TODO Is this necessary?
import * as plugins from './plugins/index.js';
export { plugins };

export * from './bundleHelpers.js';
export { insertAt } from './utils.js';

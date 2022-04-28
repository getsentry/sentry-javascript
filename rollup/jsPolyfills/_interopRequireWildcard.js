/**
 * Rollup and Sucrase both have essentially the same polyfill for `import * as someName from 'someModule'` syntax, named
 * `_interopNamespace` and `_interopRequireWildcard`, respectively. For simplicity, files with both names have been kept,
 * so that we can replace each injected function with an import of the same name.
 *
 * Sucrase only injects the polyfill when the `imports` transform is used, which we're not currently doing. By contrast,
 * Rollup injects its version when building cjs modules, which we do do. Therefore, the actual function definition lives
 * in `_interopNamespace.js`, so that there's no indirection with the one we know we'll be using. Though we likely we
 * likely won't ever this the Sucrase version here, it seemed prudent to keep the stub just in case.
 */

export const _interopRequireWildcard = require('./_interopNamespace.js');

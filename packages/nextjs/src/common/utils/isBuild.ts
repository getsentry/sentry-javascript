// The explicit `.js` extension is required for the ESM build to be loadable by plain Node.js: `next` does not define
// an `exports` map, so extensionless deep imports like `next/constants` are not resolvable by Node's ESM resolver.
import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

/**
 * Decide if the currently running process is part of the build phase or happening at runtime.
 */
export function isBuild(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}

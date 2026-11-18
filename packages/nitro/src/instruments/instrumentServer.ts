import type { Nitro } from 'nitro/types';
import { addNoExternal, addPlugin } from '../utils/plugin';
import { createResolver } from '../utils/resolver';

/**
 * Sets up the Nitro server instrumentation plugin
 * @param nitro - The Nitro instance.
 */
export function instrumentServer(nitro: Nitro): void {
  const moduleResolver = createResolver(import.meta.url);
  // The runtime imports Nitro virtual modules (`#nitro/virtual/*`) that only resolve when Nitro bundles it.
  // `nitro dev` externalizes everything in `node_modules`, so Node would load the runtime as is and fail.
  addNoExternal(nitro, `${moduleResolver.resolve('../runtime')}/`);
  addPlugin(nitro, moduleResolver.resolve('../runtime/plugins/server'));
}

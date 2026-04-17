import type { Nitro } from 'nitro/types';
import { addPlugin } from '../utils/plugin';
import { createResolver } from '../utils/resolver';

/**
 * Sets up the Nitro server instrumentation plugin
 * @param nitro - The Nitro instance.
 */
export function instrumentServer(nitro: Nitro): void {
  const moduleResolver = createResolver(import.meta.url);
  addPlugin(nitro, moduleResolver.resolve('../runtime/plugins/server'));
}

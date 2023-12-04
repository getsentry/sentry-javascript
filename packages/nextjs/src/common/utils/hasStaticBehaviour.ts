import type { StaticGenerationStore } from '../types';

/**
 * Takes a Next.js StaticGenerationStore and determines whether the current state of it would lead to static component/page behaviour.
 */
export function storeHasStaticBehaviour(staticGenerationStore: StaticGenerationStore): boolean {
  return !!(
    staticGenerationStore?.forceStatic ||
    staticGenerationStore?.isStaticGeneration ||
    staticGenerationStore?.dynamicShouldError ||
    staticGenerationStore?.experimental?.ppr ||
    staticGenerationStore?.ppr
  );
}

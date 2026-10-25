import { getCurrentScope, withScope } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../debug-logger';

/**
 * Registry tracking which AI provider modules should skip instrumentation wrapping.
 *
 * This prevents duplicate spans when a higher-level integration (like LangChain)
 * already instruments AI providers at a higher abstraction level.
 */
const SKIPPED_AI_PROVIDERS = new Set<string>();

/** Scope metadata key of the modules that `_INTERNAL_withAiProviderWrappingSkipped` skips, as `{ [module]: true }`. */
const SCOPED_SKIPPED_AI_PROVIDERS_KEY = '__SENTRY_SKIPPED_AI_PROVIDERS__';

/**
 * Mark AI provider modules to skip instrumentation wrapping.
 *
 * This prevents duplicate spans when a higher-level integration (like LangChain)
 * already instruments AI providers at a higher abstraction level.
 *
 * @internal
 * @param modules - Array of npm module names to skip (e.g., '@anthropic-ai/sdk', 'openai')
 *
 * @example
 * ```typescript
 * // In LangChain integration
 * _INTERNAL_skipAiProviderWrapping(['@anthropic-ai/sdk', 'openai', '@google/generative-ai']);
 * ```
 */
export function _INTERNAL_skipAiProviderWrapping(modules: string[]): void {
  modules.forEach(module => {
    SKIPPED_AI_PROVIDERS.add(module);
    DEBUG_BUILD && debug.log(`AI provider "${module}" wrapping will be skipped`);
  });
}

/**
 * Run `callback` with AI provider modules skipped, for the calls that it makes and the async work that
 * it starts. A call to the same provider outside of `callback` is still instrumented.
 *
 * @internal
 * @param modules - Array of npm module names to skip (e.g., '@anthropic-ai/sdk', 'openai')
 */
export function _INTERNAL_withAiProviderWrappingSkipped<T>(modules: string[], callback: () => T): T {
  return withScope(scope => {
    const skipped: Record<string, true> = {};
    for (const module of modules) {
      skipped[module] = true;
    }
    // `setSDKProcessingMetadata` merges one level deep, so a nested call adds to the modules of the outer one.
    scope.setSDKProcessingMetadata({ [SCOPED_SKIPPED_AI_PROVIDERS_KEY]: skipped });
    return callback();
  });
}

/**
 * Check if an AI provider module should skip instrumentation wrapping.
 *
 * @internal
 * @param module - The npm module name (e.g., '@anthropic-ai/sdk', 'openai')
 * @returns true if wrapping should be skipped
 *
 * @example
 * ```typescript
 * // In AI provider instrumentation
 * if (_INTERNAL_shouldSkipAiProviderWrapping('@anthropic-ai/sdk')) {
 *   return Reflect.construct(Original, args); // Don't instrument
 * }
 * ```
 */
export function _INTERNAL_shouldSkipAiProviderWrapping(module: string): boolean {
  if (SKIPPED_AI_PROVIDERS.has(module)) {
    return true;
  }
  const scoped = getCurrentScope().getScopeData().sdkProcessingMetadata[SCOPED_SKIPPED_AI_PROVIDERS_KEY] as
    | Record<string, true>
    | undefined;
  return scoped?.[module] === true;
}

/**
 * Clear all AI provider skip registrations.
 *
 * This is automatically called at the start of Sentry.init() to ensure a clean state
 * between different client initializations.
 *
 * @internal
 */
export function _INTERNAL_clearAiProviderSkips(): void {
  SKIPPED_AI_PROVIDERS.clear();
  DEBUG_BUILD && debug.log('Cleared AI provider skip registrations');
}

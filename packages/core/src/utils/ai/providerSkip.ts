import { getIsolationScope } from '../../currentScopes';
import { DEBUG_BUILD } from '../../debug-build';
import { getDefaultIsolationScope } from '../../defaultScopes';
import type { Scope } from '../../scope';
import { debug } from '../debug-logger';

/**
 * AI provider modules that should skip instrumentation wrapping, per isolation scope.
 *
 * Skips are registered lazily by a higher-level integration (like LangChain) once it drives a
 * provider, so they are bound to the invocation that registered them. A module-global set would
 * outlive the invocation on runtimes where a client serves many invocations (Cloudflare isolates,
 * Node processes) and suppress spans for direct provider calls made by later, unrelated invocations.
 */
const SKIPPED_AI_PROVIDERS = new WeakMap<Scope, Set<string>>();

function getSkips(scope: Scope): Set<string> | undefined {
  return SKIPPED_AI_PROVIDERS.get(scope);
}

/**
 * Mark AI provider modules to skip instrumentation wrapping for the current isolation scope.
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
  const scope = getIsolationScope();
  let skips = getSkips(scope);
  if (!skips) {
    skips = new Set();
    SKIPPED_AI_PROVIDERS.set(scope, skips);
  }

  for (const module of modules) {
    skips.add(module);
    DEBUG_BUILD && debug.log(`AI provider "${module}" wrapping will be skipped`);
  }
}

/**
 * Check if an AI provider module should skip instrumentation wrapping.
 *
 * A skip registered inside an invocation applies to that invocation; one registered outside any
 * invocation (on the default isolation scope) applies everywhere.
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
  return !!getSkips(getIsolationScope())?.has(module) || !!getSkips(getDefaultIsolationScope())?.has(module);
}

/**
 * Clear the AI provider skip registrations of the current and the default isolation scope.
 *
 * @internal
 */
export function _INTERNAL_clearAiProviderSkips(): void {
  SKIPPED_AI_PROVIDERS.delete(getIsolationScope());
  SKIPPED_AI_PROVIDERS.delete(getDefaultIsolationScope());
  DEBUG_BUILD && debug.log('Cleared AI provider skip registrations');
}

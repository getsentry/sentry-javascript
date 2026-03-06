import { getCurrentScope, withScope } from '../../currentScopes';
import type { Scope } from '../../scope';

const SUPPRESS_AI_PROVIDER_SPANS_KEY = '__SENTRY_SUPPRESS_AI_PROVIDER_SPANS__';

/**
 * Check if AI provider spans should be suppressed in the current scope.
 *
 * @internal
 */
export function _INTERNAL_isAiProviderSpanSuppressed(): boolean {
  return getCurrentScope().getScopeData().sdkProcessingMetadata[SUPPRESS_AI_PROVIDER_SPANS_KEY] === true;
}

/**
 * Execute a callback with AI provider spans suppressed in the current scope.
 * This is used by higher-level integrations (like LangChain) to prevent
 * duplicate spans from underlying AI provider instrumentations.
 *
 * @internal
 */
export function _INTERNAL_withSuppressedAiProviderSpans<T>(callback: () => T): T {
  return withScope((scope: Scope) => {
    scope.setSDKProcessingMetadata({ [SUPPRESS_AI_PROVIDER_SPANS_KEY]: true });
    return callback();
  });
}

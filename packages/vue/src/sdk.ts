import { getDefaultIntegrations, init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, getStackAsyncContextStrategy, setAsyncContextStrategy } from '@sentry/core/browser';
import { normalizeStringifyValue as browserNormalizeStringifyValue } from '@sentry-internal/browser-utils';
import { vueIntegration } from './integration';
import { isVueViewModel } from './isVueViewModel';
import type { Options } from './types';

/**
 * Inits the Vue SDK
 */
export function init(options: Partial<Omit<Options, 'tracingOptions'>> = {}): Client | undefined {
  const opts = {
    defaultIntegrations: [...getDefaultIntegrations(options), vueIntegration()],
    ...options,
  };

  applySdkMetadata(opts, 'vue');

  const client = browserInit(opts);

  // Add vue-specific stringification
  setAsyncContextStrategy({
    ...getStackAsyncContextStrategy(),
    normalizeStringifyValue,
  });

  return client;
}

function normalizeStringifyValue(value: Exclude<unknown, string | number | boolean | null>): string | undefined {
  if (isVueViewModel(value)) {
    return (value as { __v_isVNode?: boolean }).__v_isVNode ? '[VueVNode]' : '[VueViewModel]';
  }
  return browserNormalizeStringifyValue(value);
}

import { applySdkMetadata } from '@sentry/core';
import {init as initVue } from '@sentry/vue';
import type { SentryVueOptions } from '../common/types';
import type {Options } from '@sentry/types';

/**
 * Initializes the client-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryVueOptions): void {
  const sentryOptions = {
    ...options,
  };

  // Type cast to `Options` because Vue has slightly different options, but type is not highly relevant here
  applySdkMetadata(sentryOptions as Options, 'nuxt', ['nuxt', 'vue']);

  initVue(sentryOptions);
}

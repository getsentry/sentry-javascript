import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/browser';
import type { Span } from '@sentry/core';
import { debug } from '@sentry/core';
import { startInactiveSpan } from '@sentry/core/browser';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { afterUpdate, beforeUpdate, onMount } from 'svelte';
import { DEBUG_BUILD } from './debug_build';
import type { TrackComponentOptions } from './types';

const defaultTrackComponentOptions: {
  trackInit: boolean;
  trackUpdates: boolean;
  componentName?: string;
} = {
  trackInit: true,
  trackUpdates: false,
};

/**
 * Tracks the Svelte component's initialization and mounting operation as well as
 * updates and records them as spans.
 *
 * This function is injected automatically into your Svelte components' code
 * if you are using the withSentryConfig wrapper.
 *
 * Alternatively, you can call it yourself if you don't want to use the preprocessor.
 */
export function trackComponent(options?: TrackComponentOptions): void {
  const mergedOptions = { ...defaultTrackComponentOptions, ...options };

  const customComponentName = mergedOptions.componentName;

  const componentName = `<${customComponentName || 'Svelte Component'}>`;

  if (mergedOptions.trackInit) {
    recordInitSpan(componentName);
  }

  if (mergedOptions.trackUpdates) {
    try {
      recordUpdateSpans(componentName);
    } catch {
      DEBUG_BUILD &&
        debug.warn(
          "Cannot track component updates. This is likely because you're using Svelte 5 in Runes mode. Set `trackUpdates: false` in `withSentryConfig` or `trackComponent` to disable this warning.",
        );
    }
  }
}

function recordInitSpan(componentName: string): void {
  const initSpan = startInactiveSpan({
    onlyIfParent: true,
    name: componentName,
    attributes: {
      // TODO(conventions): Replace `'ui.mount'` with the `ui.mount` span op constant once it is released in `@sentry/conventions`.
      [SENTRY_OP]: 'ui.mount',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.svelte',
    },
  });

  onMount(() => {
    initSpan.end();
  });
}

function recordUpdateSpans(componentName: string): void {
  let updateSpan: Span | undefined;
  beforeUpdate(() => {
    updateSpan = startInactiveSpan({
      onlyIfParent: true,
      name: componentName,
      attributes: {
        // TODO(conventions): Replace `'ui.update'` with the `ui.update` span op constant once it is released in `@sentry/conventions`.
        [SENTRY_OP]: 'ui.update',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.svelte',
      },
    });
  });

  afterUpdate(() => {
    if (!updateSpan) {
      return;
    }
    updateSpan.end();
    updateSpan = undefined;
  });
}

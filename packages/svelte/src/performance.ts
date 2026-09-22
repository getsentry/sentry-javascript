import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/browser';
import type { Span } from '@sentry/core';
import { debug, getClient, hasSpanStreamingEnabled, UI_COMPONENT_SPAN_NAME_FALLBACK } from '@sentry/core';
import { startInactiveSpan } from '@sentry/core/browser';
import { SENTRY_DESCRIPTION, SENTRY_OP, UI_COMPONENT_NAME } from '@sentry/conventions/attributes';
import { UI_MOUNT, UI_UPDATE } from '@sentry/conventions/op';
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

  const innerName = customComponentName || 'Svelte Component';
  const description = `<${innerName}>`;

  if (mergedOptions.trackInit) {
    recordInitSpan(customComponentName, description);
  }

  if (mergedOptions.trackUpdates) {
    try {
      recordUpdateSpans(customComponentName, description);
    } catch {
      DEBUG_BUILD &&
        debug.warn(
          "Cannot track component updates. This is likely because you're using Svelte 5 in Runes mode. Set `trackUpdates: false` in `withSentryConfig` or `trackComponent` to disable this warning.",
        );
    }
  }
}

function recordInitSpan(componentName: string | undefined, description: string): void {
  const client = getClient();
  const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);

  const initSpan = startInactiveSpan({
    onlyIfParent: true,
    name: hasSpanStreaming ? componentName || UI_COMPONENT_SPAN_NAME_FALLBACK : description,
    attributes: {
      [SENTRY_OP]: UI_MOUNT,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.svelte',
      ...(componentName && { [UI_COMPONENT_NAME]: componentName }),
      ...(hasSpanStreaming && { [SENTRY_DESCRIPTION]: description }),
    },
  });

  onMount(() => {
    initSpan.end();
  });
}

function recordUpdateSpans(componentName: string | undefined, description: string): void {
  let updateSpan: Span | undefined;
  beforeUpdate(() => {
    const client = getClient();
    const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);

    updateSpan = startInactiveSpan({
      onlyIfParent: true,
      name: hasSpanStreaming ? componentName || UI_COMPONENT_SPAN_NAME_FALLBACK : description,
      attributes: {
        [SENTRY_OP]: UI_UPDATE,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.svelte',
        ...(componentName && { [UI_COMPONENT_NAME]: componentName }),
        ...(hasSpanStreaming && { [SENTRY_DESCRIPTION]: description }),
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

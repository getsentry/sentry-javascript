import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/browser';
import type { Span } from '@sentry/core';
import { afterUpdate, beforeUpdate, onMount } from 'svelte';

import { startInactiveSpan } from '@sentry/core';
import { DEFAULT_COMPONENT_NAME, UI_SVELTE_INIT, UI_SVELTE_UPDATE } from './constants';
import type { TrackComponentOptions } from './types';

const defaultTrackComponentOptions: {
  trackInit: boolean;
  trackUpdates: boolean;
  componentName?: string;
} = {
  trackInit: true,
  trackUpdates: true,
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

  const componentName = `<${customComponentName || DEFAULT_COMPONENT_NAME}>`;

  if (mergedOptions.trackInit) {
    recordInitSpan(componentName);
  }

  if (mergedOptions.trackUpdates) {
    recordUpdateSpans(componentName);
  }
}

function recordInitSpan(componentName: string): void {
  const initSpan = startInactiveSpan({
    onlyIfParent: true,
    op: UI_SVELTE_INIT,
    name: componentName,
    attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.svelte' },
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
      op: UI_SVELTE_UPDATE,
      name: componentName,
      attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.svelte' },
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

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, getActiveSpan } from '@sentry/browser';
import type { Span } from '@sentry/types';
import { afterUpdate, beforeUpdate, onMount } from 'svelte';
import { current_component } from 'svelte/internal';

import { getRootSpan, startInactiveSpan, withActiveSpan } from '@sentry/core';
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
 * Tracks the Svelte component's intialization and mounting operation as well as
 * updates and records them as spans.
 * This function is injected automatically into your Svelte components' code
 * if you are using the Sentry componentTrackingPreprocessor.
 * Alternatively, you can call it yourself if you don't want to use the preprocessor.
 */
export function trackComponent(options?: TrackComponentOptions): void {
  const mergedOptions = { ...defaultTrackComponentOptions, ...options };

  const customComponentName = mergedOptions.componentName;

  // current_component.ctor.name is likely to give us the component's name automatically
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const componentName = `<${customComponentName || current_component.constructor.name || DEFAULT_COMPONENT_NAME}>`;

  let initSpan: Span | undefined = undefined;
  if (mergedOptions.trackInit) {
    initSpan = recordInitSpan(componentName);
  }

  if (mergedOptions.trackUpdates) {
    recordUpdateSpans(componentName, initSpan);
  }
}

function recordInitSpan(componentName: string): Span | undefined {
  const initSpan = startInactiveSpan({
    onlyIfParent: true,
    op: UI_SVELTE_INIT,
    name: componentName,
    attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.svelte' },
  });

  onMount(() => {
    initSpan.end();
  });

  return initSpan;
}

function recordUpdateSpans(componentName: string, initSpan?: Span): void {
  let updateSpan: Span | undefined;
  beforeUpdate(() => {
    // We need to get the active transaction again because the initial one could
    // already be finished or there is currently no transaction going on.
    const activeSpan = getActiveSpan();
    if (!activeSpan) {
      return;
    }

    // If we are initializing the component when the update span is started, we start it as child
    // of the init span. Else, we start it as a child of the transaction.
    const parentSpan =
      initSpan && initSpan.isRecording() && getRootSpan(initSpan) === getRootSpan(activeSpan)
        ? initSpan
        : getRootSpan(activeSpan);

    if (!parentSpan) return;

    updateSpan = withActiveSpan(parentSpan, () => {
      return startInactiveSpan({
        op: UI_SVELTE_UPDATE,
        name: componentName,
        attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.svelte' },
      });
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

import { getCurrentHub } from '@sentry/browser';
import type { Span, Transaction } from '@sentry/types';
import { afterUpdate, beforeUpdate, onMount } from 'svelte';
import { current_component } from 'svelte/internal';

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

  const transaction = getActiveTransaction();
  if (!transaction) {
    return;
  }

  const customComponentName = mergedOptions.componentName;

  // current_component.ctor.name is likely to give us the component's name automatically
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const componentName = `<${customComponentName || current_component.constructor.name || DEFAULT_COMPONENT_NAME}>`;

  let initSpan: Span | undefined = undefined;
  if (mergedOptions.trackInit) {
    initSpan = recordInitSpan(transaction, componentName);
  }

  if (mergedOptions.trackUpdates) {
    recordUpdateSpans(componentName, initSpan);
  }
}

function recordInitSpan(transaction: Transaction, componentName: string): Span {
  const initSpan = transaction.startChild({
    op: UI_SVELTE_INIT,
    description: componentName,
  });

  onMount(() => {
    initSpan.finish();
  });

  return initSpan;
}

function recordUpdateSpans(componentName: string, initSpan?: Span): void {
  let updateSpan: Span | undefined;
  beforeUpdate(() => {
    // We need to get the active transaction again because the initial one could
    // already be finished or there is currently no transaction going on.
    const transaction = getActiveTransaction();
    if (!transaction) {
      return;
    }

    // If we are initializing the component when the update span is started, we start it as child
    // of the init span. Else, we start it as a child of the transaction.
    const parentSpan =
      initSpan && !initSpan.endTimestamp && initSpan.transaction === transaction ? initSpan : transaction;

    updateSpan = parentSpan.startChild({
      op: UI_SVELTE_UPDATE,
      description: componentName,
    });
  });

  afterUpdate(() => {
    if (!updateSpan) {
      return;
    }
    updateSpan.finish();
    updateSpan = undefined;
  });
}

function getActiveTransaction(): Transaction | undefined {
  const currentHub = getCurrentHub();
  const scope = currentHub && currentHub.getScope();
  return scope && scope.getTransaction();
}

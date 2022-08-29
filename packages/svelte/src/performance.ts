import { getCurrentHub } from '@sentry/browser';
import { Span, Transaction } from '@sentry/types';
import { afterUpdate, beforeUpdate, onMount } from 'svelte';
import { current_component } from 'svelte/internal';

import { DEFAULT_COMPONENT_NAME, UI_SVELTE_MOUNT, UI_SVELTE_UPDATE } from './constants';
import { TrackingOptions } from './types';

const defaultOptions: TrackingOptions = {
  trackMount: true,
  trackUpdates: true,
};

/**
 * Tracks the Svelte component's intialization and mounting operation as well as
 * updates and records them as spans.
 * This function is injected automatically into your Svelte components' code
 * if you are using the Sentry componentTrackingPreprocessor.
 * Alternatively, you can call it yourself if you don't want to use the preprocessor.
 */
export function trackComponent(options: TrackingOptions = defaultOptions): void {
  const transaction = getActiveTransaction();
  if (!transaction) {
    return;
  }

  const customComponentName = options && options.componentName;

  // current_component.ctor.name is likely to give us the component's name automatically
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const componentName = `<${customComponentName || current_component.constructor.name || DEFAULT_COMPONENT_NAME}>`;

  let mountSpan: Span | undefined = undefined;
  if (options.trackMount) {
    mountSpan = recordMountSpan(transaction, componentName);
  }

  if (options.trackUpdates) {
    recordUpdateSpans(componentName, mountSpan);
  }
}

function recordMountSpan(transaction: Transaction, componentName: string): Span {
  const mountSpan = transaction.startChild({
    op: UI_SVELTE_MOUNT,
    description: componentName,
  });

  onMount(() => {
    mountSpan.finish();
  });

  return mountSpan;
}

function recordUpdateSpans(componentName: string, mountSpan?: Span): void {
  let updateSpan: Span | undefined;
  beforeUpdate(() => {
    // We need to get the active transaction again because the initial one could
    // already be finished or there is no transaction going on, currently.
    const transaction = getActiveTransaction();
    if (!transaction) {
      return;
    }

    // If we are mounting the component when the update span is started, we start it as child of the
    // mount span. Else, we start it as a child of the transaction.
    const parentSpan =
      mountSpan && !mountSpan.endTimestamp && mountSpan.transaction === transaction ? mountSpan : transaction;

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

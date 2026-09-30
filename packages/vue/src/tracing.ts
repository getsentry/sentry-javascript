import { getActiveSpan, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/browser';
import type { Span } from '@sentry/core';
import { debug, timestampInSeconds, uniq } from '@sentry/core';
import { DEFAULT_HOOKS, DEFAULT_ROOT_SPAN_TIMEOUT } from './constants';
import { DEBUG_BUILD } from './debug-build';
import type { Hook, Operation, TracingOptions, ViewModel, Vue } from './types';
import { formatComponentName } from './vendor/components';

const VUE_OP = 'ui.vue';

export type Mixins = Parameters<Vue['mixin']>[0];

export interface VueSentry extends ViewModel {
  readonly $root: VueSentry;
  $_sentryComponentSpans?: {
    [key: string]: Span | undefined;
  };
  $_sentryRootComponentSpan?: Span;
  $_sentryRootComponentSpanTimer?: ReturnType<typeof setTimeout>;
  $_sentryRootComponentSpanActivity?: number;
}

// Mappings from operation to corresponding lifecycle hook.
const HOOKS: { [key in Operation]: Hook[] } = {
  activate: ['activated', 'deactivated'],
  create: ['beforeCreate', 'created'],
  // Vue 3
  unmount: ['beforeUnmount', 'unmounted'],
  // Vue 2
  destroy: ['beforeDestroy', 'destroyed'],
  mount: ['beforeMount', 'mounted'],
  update: ['beforeUpdate', 'updated'],
};

/**
 * End the root component span once no render activity happened for `timeout` (a debounce).
 *
 * All debounce state lives on `$root`, so hooks from every component share one timer. Each component
 * only writes a timestamp (no new timer is created). So mounting any number of components uses a single timer.
 */
function maybeEndRootComponentSpan(vm: VueSentry, timestamp: number, timeout: number): void {
  const root = vm.$root;
  root.$_sentryRootComponentSpanActivity = timestamp;

  if (!root.$_sentryRootComponentSpanTimer) {
    scheduleRootComponentSpanEnd(root, timestamp, timeout);
  }
}

/**
 * Fires `delayMs` after the activity that scheduled it. Activity recorded in the meantime pushes
 * the deadline out by the recorded gap, so the span always ends at the last activity timestamp.
 */
function scheduleRootComponentSpanEnd(root: VueSentry, activityWhenScheduled: number, delayMs: number): void {
  root.$_sentryRootComponentSpanTimer = setTimeout(() => {
    root.$_sentryRootComponentSpanTimer = undefined;

    const lastActivity = root.$_sentryRootComponentSpanActivity ?? activityWhenScheduled;
    if (lastActivity > activityWhenScheduled) {
      // activity happened after this timer was scheduled: push the deadline out
      scheduleRootComponentSpanEnd(root, lastActivity, (lastActivity - activityWhenScheduled) * 1000);
      return;
    }

    if (root.$_sentryRootComponentSpan) {
      root.$_sentryRootComponentSpan.end(lastActivity);
      root.$_sentryRootComponentSpan = undefined;
    }
  }, delayMs);
}

/** Find if the current component exists in the provided `TracingOptions.trackComponents` array option. */
export function findTrackComponent(trackComponents: string[], formattedName: string): boolean {
  function extractComponentName(name: string): string {
    return name.replace(/^<([^\s]*)>(?: at [^\s]*)?$/, '$1');
  }

  const isMatched = trackComponents.some(compo => {
    return extractComponentName(formattedName) === extractComponentName(compo);
  });

  return isMatched;
}

export const createTracingMixins = (options: Partial<TracingOptions> = {}): Mixins => {
  const hooks = uniq((options.hooks || []).concat(DEFAULT_HOOKS));

  const mixins: Mixins = {};

  const rootComponentSpanFinalTimeout = options.timeout || DEFAULT_ROOT_SPAN_TIMEOUT;

  for (const operation of hooks) {
    // Retrieve corresponding hooks from Vue lifecycle.
    // eg. mount => ['beforeMount', 'mounted']
    const internalHooks = HOOKS[operation];
    if (!internalHooks) {
      DEBUG_BUILD && debug.warn(`Unknown hook: ${operation}`);
      continue;
    }

    for (const internalHook of internalHooks) {
      mixins[internalHook] = function (this: VueSentry) {
        const isRootComponent = this.$root === this;

        // 1. Root Component span creation
        if (isRootComponent) {
          this.$_sentryRootComponentSpan =
            this.$_sentryRootComponentSpan ||
            startInactiveSpan({
              name: 'Application Render',
              op: `${VUE_OP}.render`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.vue',
              },
              onlyIfParent: true,
            });

          // call debounced end function once directly, just in case no child components call it
          maybeEndRootComponentSpan(this, timestampInSeconds(), rootComponentSpanFinalTimeout);
        }

        // 2. Component tracking filter
        const componentName = formatComponentName(this, false);

        const shouldTrack =
          isRootComponent || // We always want to track the root component
          (Array.isArray(options.trackComponents)
            ? findTrackComponent(options.trackComponents, componentName)
            : options.trackComponents);

        // We always want to track root component
        if (!shouldTrack) {
          // even if we don't track `this` component, we still want to end the root span eventually
          maybeEndRootComponentSpan(this, timestampInSeconds(), rootComponentSpanFinalTimeout);
          return;
        }

        this.$_sentryComponentSpans = this.$_sentryComponentSpans || {};

        // 3. Span lifecycle management based on the hook type
        const isBeforeHook = internalHook === internalHooks[0];
        const activeSpan = this.$root?.$_sentryRootComponentSpan || getActiveSpan();

        if (isBeforeHook) {
          // Starting a new span in the "before" hook
          if (activeSpan) {
            // Cancel any existing span for this operation (safety measure)
            // We're actually not sure if it will ever be the case that cleanup hooks were not called.
            // However, we had users report that spans didn't end, so we end the span before
            // starting a new one, just to be sure.
            const oldSpan = this.$_sentryComponentSpans[operation];
            if (oldSpan) {
              oldSpan.end();
            }

            this.$_sentryComponentSpans[operation] = startInactiveSpan({
              name: `Vue ${componentName}`,
              op: `${VUE_OP}.${operation}`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.vue',
              },
              // UI spans should only be created if there is an active root span (transaction)
              onlyIfParent: true,
            });
          }
        } else {
          // The span should already be added via the first handler call (in the 'before' hook)
          const span = this.$_sentryComponentSpans[operation];
          // The before hook did not start the tracking span, so the span was not added.
          // This is probably because it happened before there is an active transaction
          if (!span) return; // Skip if no span was created in the "before" hook
          span.end();

          // For any "after" hook, also schedule the root component span to end
          maybeEndRootComponentSpan(this, timestampInSeconds(), rootComponentSpanFinalTimeout);
        }
      };
    }
  }

  return mixins;
};

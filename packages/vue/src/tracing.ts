import { getActiveSpan, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/browser';
import type { Span } from '@sentry/core';
import { logger, timestampInSeconds } from '@sentry/core';
import { DEFAULT_HOOKS } from './constants';
import { DEBUG_BUILD } from './debug-build';
import type { Hook, Operation, TracingOptions, ViewModel, Vue } from './types';
import { formatComponentName } from './vendor/components';

const VUE_OP = 'ui.vue';

type Mixins = Parameters<Vue['mixin']>[0];

interface VueSentry extends ViewModel {
  readonly $root: VueSentry;
  $_sentrySpans?: {
    [key: string]: Span | undefined;
  };
  $_sentryRootSpan?: Span;
  $_sentryRootSpanTimer?: ReturnType<typeof setTimeout>;
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

/** Finish top-level span and activity with a debounce configured using `timeout` option */
function finishRootSpan(vm: VueSentry, timestamp: number, timeout: number): void {
  if (vm.$_sentryRootSpanTimer) {
    clearTimeout(vm.$_sentryRootSpanTimer);
  }

  vm.$_sentryRootSpanTimer = setTimeout(() => {
    if (vm.$root?.$_sentryRootSpan) {
      vm.$root.$_sentryRootSpan.end(timestamp);
      vm.$root.$_sentryRootSpan = undefined;
    }
  }, timeout);
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
  const hooks = (options.hooks || [])
    .concat(DEFAULT_HOOKS)
    // Removing potential duplicates
    .filter((value, index, self) => self.indexOf(value) === index);

  const mixins: Mixins = {};

  for (const operation of hooks) {
    // Retrieve corresponding hooks from Vue lifecycle.
    // eg. mount => ['beforeMount', 'mounted']
    const internalHooks = HOOKS[operation];
    if (!internalHooks) {
      DEBUG_BUILD && logger.warn(`Unknown hook: ${operation}`);
      continue;
    }

    for (const internalHook of internalHooks) {
      mixins[internalHook] = function (this: VueSentry) {
        const isRoot = this.$root === this;

        // 1. Root span creation
        if (isRoot) {
          this.$_sentryRootSpan =
            this.$_sentryRootSpan ||
            startInactiveSpan({
              name: 'Application Render',
              op: `${VUE_OP}.render`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.vue',
              },
              onlyIfParent: true,
            });
        }

        // 2. Component tracking filter
        const componentName = formatComponentName(this, false);

        const shouldTrack =
          isRoot || // We always want to track the root component
          (Array.isArray(options.trackComponents)
            ? findTrackComponent(options.trackComponents, componentName)
            : options.trackComponents);

        if (!shouldTrack) {
          return;
        }

        this.$_sentrySpans = this.$_sentrySpans || {};

        // 3. Span lifecycle management based on the hook type
        const isBeforeHook = internalHook === internalHooks[0];
        const activeSpan = this.$root?.$_sentryRootSpan || getActiveSpan();

        if (isBeforeHook) {
          // Starting a new span in the "before" hook
          if (activeSpan) {
            // Cancel any existing span for this operation (safety measure)
            // We're actually not sure if it will ever be the case that cleanup hooks were not called.
            // However, we had users report that spans didn't get finished, so we finished the span before
            // starting a new one, just to be sure.
            const oldSpan = this.$_sentrySpans[operation];
            if (oldSpan) {
              oldSpan.end();
            }

            this.$_sentrySpans[operation] = startInactiveSpan({
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
          const span = this.$_sentrySpans[operation];
          // The before hook did not start the tracking span, so the span was not added.
          // This is probably because it happened before there is an active transaction
          if (!span) return; // Skip if no span was created in the "before" hook
          span.end();

          // For any "after" hook, also schedule the root span to finish
          finishRootSpan(this, timestampInSeconds(), options.timeout || 2000);
        }
      };
    }
  }

  return mixins;
};

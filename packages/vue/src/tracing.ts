import { getCurrentHub } from '@sentry/browser';
import { Span, Transaction } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';

import { formatComponentName } from './components';
import { DEFAULT_HOOKS } from './constants';
import { Hook, Operation, TracingOptions, ViewModel, Vue } from './types';

const VUE_OP = 'ui.vue';

type Mixins = Parameters<Vue['mixin']>[0];

interface VueSentry extends ViewModel {
  readonly $root: VueSentry;
  $_sentrySpans?: {
    [key: string]: Span;
  };
  $_sentryRootSpan?: Span;
  $_sentryRootSpanTimer?: ReturnType<typeof setTimeout>;
}

// Mappings from operation to corresponding lifecycle hook.
const HOOKS: { [key in Operation]: Hook[] } = {
  activate: ['activated', 'deactivated'],
  create: ['beforeCreate', 'created'],
  destroy: ['beforeDestroy', 'destroyed'],
  mount: ['beforeMount', 'mounted'],
  update: ['beforeUpdate', 'updated'],
};

/** Grabs active transaction off scope, if any */
function getActiveTransaction(): Transaction | undefined {
  return getCurrentHub()
    .getScope()
    ?.getTransaction();
}

/** Finish top-level span and activity with a debounce configured using `timeout` option */
function finishRootSpan(vm: VueSentry, timestamp: number, timeout: number): void {
  if (vm.$_sentryRootSpanTimer) {
    clearTimeout(vm.$_sentryRootSpanTimer);
  }

  vm.$_sentryRootSpanTimer = setTimeout(() => {
    if (vm.$root?.$_sentryRootSpan) {
      vm.$root.$_sentryRootSpan.finish(timestamp);
      vm.$root.$_sentryRootSpan = undefined;
    }
  }, timeout);
}

export const createTracingMixins = (options: TracingOptions): Mixins => {
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
      logger.warn(`Unknown hook: ${operation}`);
      continue;
    }

    for (const internalHook of internalHooks) {
      mixins[internalHook] = function(this: VueSentry) {
        const isRoot = this.$root === this;

        if (isRoot) {
          const activeTransaction = getActiveTransaction();
          if (activeTransaction) {
            this.$_sentryRootSpan =
              this.$_sentryRootSpan ||
              activeTransaction.startChild({
                description: 'Application Render',
                op: VUE_OP,
              });
          }
        }

        // Skip components that we don't want to track to minimize the noise and give a more granular control to the user
        const name = formatComponentName(this, false);
        const shouldTrack = Array.isArray(options.trackComponents)
          ? options.trackComponents.includes(name)
          : options.trackComponents;

        // We always want to track root component
        if (!isRoot && !shouldTrack) {
          return;
        }

        this.$_sentrySpans = this.$_sentrySpans || {};

        // On the first handler call (before), it'll be undefined, as `$once` will add it in the future.
        // However, on the second call (after), it'll be already in place.
        const span = this.$_sentrySpans[operation];

        if (span) {
          span.finish();
          finishRootSpan(this, timestampInSeconds(), options.timeout);
        } else {
          const activeTransaction = this.$root?.$_sentryRootSpan || getActiveTransaction();
          if (activeTransaction) {
            this.$_sentrySpans[operation] = activeTransaction.startChild({
              description: `Vue <${name}>`,
              op: `${VUE_OP}.${operation}`,
            });
          }
        }
      };
    }
  }

  return mixins;
};

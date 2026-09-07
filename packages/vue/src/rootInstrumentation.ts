import { timestampInSeconds } from '@sentry/core';
import type { Mixins, VueSentry } from './tracing';
import { maybeEndRootComponentSpan } from './tracing';
import type { Vue } from './types';

interface RootInstrumentation {
  vm: VueSentry;
  timeout: number;
}

const instrumentedApps = new WeakMap<Vue, RootInstrumentation>();

/**
 * The mixin hooks only check `$root === this` to detect the root component, so a self-referential
 * stand-in works in place of the real instance, which does not exist yet at wrap time.
 */
function createRootViewModel(): VueSentry {
  const vm: { $root?: unknown; $props: Record<string, unknown> } = { $props: {} };
  vm.$root = vm;
  return vm as unknown as VueSentry;
}

/**
 * Records the `Application Render` and root component mount spans by wrapping `app.mount()`, for
 * builds where the Options API is compiled out and `app.mixin()` is a silent no-op (Nuxt 5 default).
 *
 * Vue runs all `mounted` hooks before `mount()` returns, so the wrap covers the same window as the
 * mixin's root hooks. Late mounts extend neither path; the mixin's debounce timers are per component.
 */
export function instrumentAppMountWithoutMixin(app: Vue, mixins: Mixins, timeout: number): void {
  // A second wrap would duplicate the root spans (e.g. user and Nuxt SDK both add the integration).
  if (instrumentedApps.has(app)) {
    return;
  }

  const appWithMount = app as Vue & { mount?: (...args: unknown[]) => unknown };
  const originalMount = appWithMount.mount;
  // Guards odd app-like objects; Vue 2 constructors lack `mount` but never get here (their `app.mixin()` works).
  if (typeof originalMount !== 'function') {
    return;
  }

  const vm = createRootViewModel();
  instrumentedApps.set(app, { vm, timeout });

  // `createTracingMixins` always merges `DEFAULT_HOOKS`, so the `mount` pair exists.
  const mountHooks = mixins as Partial<Record<'beforeMount' | 'mounted', (this: VueSentry) => void>>;

  appWithMount.mount = function (...args: unknown[]): unknown {
    mountHooks.beforeMount?.call(vm);
    try {
      return originalMount.apply(this, args);
    } finally {
      // Also runs when mounting throws, so the started root component span always ends.
      mountHooks.mounted?.call(vm);
    }
  };
}

/**
 * Extends the debounce that ends the `Application Render` span, so framework SDKs can report
 * render activity the root cannot see (e.g. Nuxt's `<Suspense>` resolving). No-op on the mixin
 * path and after the span has ended.
 *
 * @internal Exported for the Sentry Nuxt SDK, not part of the stable public API.
 * @experimental May change or be removed in any release.
 */
export function INTERNAL_extendVueRootRenderSpan(app: Vue): void {
  const instrumentation = instrumentedApps.get(app);
  // Skip after the span ended; otherwise each call (every Nuxt `page:finish`) arms a dead timer.
  if (instrumentation?.vm.$_sentryRootComponentSpan) {
    maybeEndRootComponentSpan(instrumentation.vm, timestampInSeconds(), instrumentation.timeout);
  }
}

import type { Mixins, VueSentry } from './tracing';
import type { Vue } from './types';

const instrumentedApps = new WeakSet<Vue>();

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
export function instrumentAppMountWithoutMixin(app: Vue, mixins: Mixins): void {
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
  instrumentedApps.add(app);

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

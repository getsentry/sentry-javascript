import type { Navigation } from '@sveltejs/kit';
import { navigating, page } from '$app/state';

declare const $effect: {
  (callback: () => void): void;
  root(callback: () => void): () => void;
};

/**
 * Observes the current page's parameterized route id (`$app/state`'s `page.route.id`). Unlike Kit 2's
 * `page` store, the rune isn't populated synchronously when the SDK sets up during `Sentry.init`, so
 * we react to it instead of reading it once. Used to upgrade the pageload span from `url` to `route`.
 */
export function onPageRouteChange(callback: (routeId: string | null) => void): () => void {
  return $effect.root(() => {
    $effect(() => {
      callback(page.route.id);
    });
  });
}

export function onNavigationChange(callback: (navigation: Navigation | null) => void): () => void {
  return $effect.root(() => {
    $effect(() => {
      callback(_snapshot());
    });
  });
}

/**
 * Reads the current navigation synchronously. `$effect`s are always batched to a microtask, which is
 * too late to catch SvelteKit's synchronous data-request `fetch` at navigation start; a synchronous
 * rune read lets us start the navigation span before that request so it propagates the right trace.
 */
export function getCurrentNavigation(): Navigation | null {
  return _snapshot();
}

function _snapshot(): Navigation | null {
  if (navigating.type === null) {
    return null;
  }

  return {
    complete: navigating.complete,
    delta: navigating.delta,
    from: navigating.from,
    to: navigating.to,
    type: navigating.type,
    willUnload: navigating.willUnload,
  } as Navigation;
}

import type { Navigation } from '@sveltejs/kit';
import { navigating } from '$app/state';

declare const $effect: {
  (callback: () => void): void;
  root(callback: () => void): () => void;
};

export function onNavigationChange(callback: (navigation: Navigation | null) => void): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (navigating.type === null) {
        callback(null);
        return;
      }

      callback({
        complete: navigating.complete,
        delta: navigating.delta,
        from: navigating.from,
        to: navigating.to,
        type: navigating.type,
        willUnload: navigating.willUnload,
      } as Navigation);
    });
  });
}

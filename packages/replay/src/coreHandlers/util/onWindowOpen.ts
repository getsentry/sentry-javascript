import { fill } from '@sentry/utils';

import { WINDOW } from '../../constants';

type WindowOpenHandler = () => void;

let handlers: undefined | WindowOpenHandler[];

/**
 * Register a handler to be called when `window.open()` is called.
 * Returns a cleanup function.
 */
export function onWindowOpen(cb: WindowOpenHandler): () => void {
  // Ensure to only register this once
  if (!handlers) {
    handlers = [];
    monkeyPatchWindowOpen();
  }

  handlers.push(cb);

  return () => {
    const pos = handlers ? handlers.indexOf(cb) : -1;
    if (pos > -1) {
      (handlers as WindowOpenHandler[]).splice(pos, 1);
    }
  };
}

function monkeyPatchWindowOpen(): void {
  fill(WINDOW, 'open', function (originalWindowOpen: () => void): () => void {
    return function (...args: unknown[]): void {
      if (handlers) {
        try {
          handlers.forEach(handler => handler());
        } catch (e) {
          // ignore errors in here
        }
      }

      return originalWindowOpen.apply(WINDOW, args);
    };
  });
}

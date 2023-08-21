import type { Backburner } from '@ember/runloop/-private/backburner';

/**
 * Backburner needs to be extended as it's missing the 'off' method.
 */
interface ExtendedBackburner extends Backburner {
  off(...args: unknown[]): void;
}

/**
 * Runloop needs to be extended to expose backburner as suggested here:
 * https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/ember__runloop/ember__runloop-tests.ts#L9
 */
declare module '@ember/runloop' {
  interface RunNamespace {
    backburner?: ExtendedBackburner;
  }
  export const _backburner: ExtendedBackburner; // Ember 4.0
}

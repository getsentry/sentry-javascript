/* eslint-disable @typescript-eslint/no-explicit-any */

import { GLOBAL_OBJ } from '@sentry/utils';

/**
 * Wrap the global error class so that the `name` property of instances of `Error` subclasses matches the name of the
 * class. The wrapper class is also called `Error` so that the wrapping is transparent to the user.
 */
export function wrapErrorClass(): void {
  /** JSDoc */
  class Error extends GLOBAL_OBJ.Error {
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    constructor(...args: any[]) {
      super(...args);
      this.name = this.constructor.name;
    }
  }

  GLOBAL_OBJ.Error = Error as typeof GLOBAL_OBJ.Error;
}

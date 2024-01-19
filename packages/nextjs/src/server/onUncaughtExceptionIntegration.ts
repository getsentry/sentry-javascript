import { Integrations } from '@sentry/node';
const { OnUncaughtException: OriginalOnUncaughtException } = Integrations;

/**
 * A custom OnUncaughtException integration that does not exit by default.
 */
export class OnUncaughtException extends OriginalOnUncaughtException {
  public constructor(options?: ConstructorParameters<typeof OriginalOnUncaughtException>[0]) {
    super({
      exitEvenIfOtherHandlersAreRegistered: false,
      ...options,
    });
  }
}

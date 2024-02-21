import { Integrations } from '@sentry/node-experimental';

/**
 * A custom OnUncaughtException integration that does not exit by default.
 */
export class OnUncaughtException extends Integrations.OnUncaughtException {
  public constructor(options?: ConstructorParameters<typeof Integrations.OnUncaughtException>[0]) {
    super({
      exitEvenIfOtherHandlersAreRegistered: false,
      ...options,
    });
  }
}

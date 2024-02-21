import { Integrations } from '@sentry/node-experimental';

/**
 * A custom HTTP integration where we always enable tracing.
 */
export class Http extends Integrations.Http {
  public constructor(options?: ConstructorParameters<typeof Integrations.Http>[0]) {
    super({
      ...options,
      tracing: true,
    });
  }
}

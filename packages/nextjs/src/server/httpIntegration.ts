import { Integrations } from '@sentry/node';
const { Http: OriginalHttp } = Integrations;

/**
 * A custom HTTP integration where we always enable tracing.
 */
export class Http extends OriginalHttp {
  public constructor(options?: ConstructorParameters<typeof OriginalHttp>[0]) {
    super({
      ...options,
      tracing: true,
    });
  }
}

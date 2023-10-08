import type { RequestInstrumentationOptions } from '@sentry/browser';
import { instrumentOutgoingRequests } from '@sentry/browser';
import type { Integration } from '@sentry/types';

type TraceFetchOptions = Partial<Omit<RequestInstrumentationOptions, 'traceXHR'>>;

/** Adds fetch spans to transactions. */
export class TraceFetch implements Integration {
  /** @inheritDoc */
  public static id = 'TraceFetch';

  /** @inheritDoc */
  public name: string = TraceFetch.id;

  public constructor(private readonly _options: TraceFetchOptions = {}) {}

  /** @inheritDoc */
  public setupOnce(): void {
    instrumentOutgoingRequests({
      traceFetch: true,
      ...this._options,
      traceXHR: false,
    });
  }
}

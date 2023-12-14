import type { ClientOptions, Integration } from '@sentry/types';
import type { BaseClient } from '../baseclient';
import { SimpleMetricsAggregator } from './simpleaggregator';

/**
 * Enables Sentry metrics monitoring.
 *
 * @experimental This API is experimental and might having breaking changes in the future.
 */
export class MetricsAggregator implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'MetricsAggregator';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    this.name = MetricsAggregator.id;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // Do nothing
  }

  /**
   * @inheritDoc
   */
  public setup(client: BaseClient<ClientOptions>): void {
    client.metricsAggregator = new SimpleMetricsAggregator(client);
  }
}

import Route from '@ember/routing/route';
import type { BrowserClient } from '@sentry/ember';
import * as Sentry from '@sentry/ember';

export default class ReplayRoute extends Route {
  public async beforeModel(): Promise<void> {
    const { Replay } = Sentry;

    if (!Sentry.getCurrentHub().getIntegration(Replay)) {
      const client = Sentry.getCurrentHub().getClient() as BrowserClient;
      client.addIntegration(new Replay());
    }
  }
}

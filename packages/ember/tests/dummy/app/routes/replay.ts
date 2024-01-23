import Route from '@ember/routing/route';
import type { BrowserClient } from '@sentry/ember';
import * as Sentry from '@sentry/ember';

export default class ReplayRoute extends Route {
  public async beforeModel(): Promise<void> {
    const { replayIntegration } = Sentry;
    const client = Sentry.getClient<BrowserClient>();
    if (client && !client.getIntegrationByName('Replay')) {
      client.addIntegration(replayIntegration());
    }
  }
}

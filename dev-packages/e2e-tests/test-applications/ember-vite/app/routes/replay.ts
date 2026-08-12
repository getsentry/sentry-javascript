import Route from '@ember/routing/route';
import * as Sentry from '@sentry/ember';

export default class ReplayRoute extends Route {
  async beforeModel(): Promise<void> {
    const { replayIntegration } = Sentry;
    const client = Sentry.getClient();
    if (client && !client.getIntegrationByName('Replay')) {
      client.addIntegration(replayIntegration());
    }
  }
}

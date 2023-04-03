import Route from '@ember/routing/route';
import * as Sentry from '@sentry/ember';

export default class ReplayRoute extends Route {
  async beforeModel() {
    const { Replay } = Sentry;

    if (!Sentry.getCurrentHub().getIntegration(Replay)) {
      const client = Sentry.getCurrentHub().getClient();
      client.addIntegration(new Replay());
    }
  }
}

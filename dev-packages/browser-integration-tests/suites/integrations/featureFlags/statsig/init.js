import * as Sentry from '@sentry/browser';

class MockStatsigClient {
  constructor() {
    this._gateEvaluationListeners = [];
  }

  on(event, listener) {
    this._gateEvaluationListeners.push(listener);
  }

  checkGate(name, defaultVal) {
    // Note the actual StatsigClient.checkGate does not take a defaultVal.
    this._gateEvaluationListeners.forEach(listener => {
      listener({ gate: { name, value: defaultVal } });
    });
    return defaultVal;
  }
}

window.statsigClient = new MockStatsigClient();

window.Sentry = Sentry;
window.sentryStatsigIntegration = Sentry.statsigIntegration({ statsigClient: window.statsigClient });

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.sentryStatsigIntegration],
});

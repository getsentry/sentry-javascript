import * as Sentry from '@sentry/browser';

class MockStatsigClient {
  constructor() {
    this._gateEvaluationListeners = [];
    this._mockGateValues = {};
  }

  on(event, listener) {
    this._gateEvaluationListeners.push(listener);
  }

  checkGate(name) {
    const value = this._mockGateValues[name] || false; // unknown features default to false.
    this._gateEvaluationListeners.forEach(listener => {
      listener({ gate: { name, value } });
    });
    return value;
  }

  setMockGateValue(name, value) {
    this._mockGateValues[name] = value;
  }
}

window.statsigClient = new MockStatsigClient();

window.Sentry = Sentry;
window.sentryStatsigIntegration = Sentry.statsigIntegration({ featureFlagClient: window.statsigClient });

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.sentryStatsigIntegration],
});

import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Minimal GrowthBook-like class that matches the real API for testing
class GrowthBookLike {
  private _features: Record<string, { value: unknown }> = {};

  public isOn(featureKey: string): boolean {
    const feature = this._features[featureKey];
    return feature ? !!feature.value : false;
  }

  public getFeatureValue(featureKey: string, defaultValue: unknown): unknown {
    const feature = this._features[featureKey];
    return feature ? feature.value : defaultValue;
  }

  // Helper method to set feature values for testing
  public setFeature(featureKey: string, value: unknown): void {
    this._features[featureKey] = { value };
  }
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.growthbookIntegration({ growthbookClass: GrowthBookLike })],
});

const gb = new GrowthBookLike();

// Set up feature flags
gb.setFeature('feat1', true);
gb.setFeature('feat2', false);
gb.setFeature('bool-feat', true);

Sentry.startSpan({ name: 'test-span', op: 'function' }, () => {
  // Evaluate feature flags during the span
  gb.isOn('feat1');
  gb.isOn('feat2');

  // Test getFeatureValue with boolean values (should be captured)
  gb.getFeatureValue('bool-feat', false);

  // Test getFeatureValue with non-boolean values (should NOT be captured)
  gb.setFeature('string-feat', 'hello');
  gb.getFeatureValue('string-feat', 'default');
});

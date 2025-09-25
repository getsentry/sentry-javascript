import { _INTERNAL_FLAG_BUFFER_SIZE as FLAG_BUFFER_SIZE } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Minimal GrowthBook-like class that matches the real API for testing
// This is necessary since we don't want to add @growthbook/growthbook as a dependency
// just for integration tests, but we want to test the actual integration behavior
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
  transport: loggingTransport,
  integrations: [Sentry.growthbookIntegration({ growthbookClass: GrowthBookLike })],
});

const gb = new GrowthBookLike();

// Fill buffer with flags 1-100 (all false by default)
for (let i = 1; i <= FLAG_BUFFER_SIZE; i++) {
  gb.isOn(`feat${i}`);
}

// Add feat101 (true), which should evict feat1
gb.setFeature(`feat${FLAG_BUFFER_SIZE + 1}`, true);
gb.isOn(`feat${FLAG_BUFFER_SIZE + 1}`);

// Update feat3 to true, which should move it to the end
gb.setFeature('feat3', true);
gb.isOn('feat3');

// Test getFeatureValue with boolean values (should be captured)
gb.setFeature('bool-feat', true);
gb.getFeatureValue('bool-feat', false);

// Test getFeatureValue with non-boolean values (should NOT be captured)
gb.setFeature('string-feat', 'hello');
gb.getFeatureValue('string-feat', 'default');
gb.setFeature('number-feat', 42);
gb.getFeatureValue('number-feat', 0);

throw new Error('Test error');

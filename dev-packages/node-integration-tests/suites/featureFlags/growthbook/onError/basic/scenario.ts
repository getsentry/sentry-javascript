import type { ClientOptions, UserContext } from '@growthbook/growthbook';
import { GrowthBookClient } from '@growthbook/growthbook';
import { _INTERNAL_FLAG_BUFFER_SIZE as FLAG_BUFFER_SIZE } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Wrapper class to instantiate GrowthBookClient
class GrowthBookWrapper {
  private _gbClient: GrowthBookClient;
  private _userContext: UserContext = { attributes: { id: 'test-user-123' } };

  public constructor(..._args: unknown[]) {
    // Create GrowthBookClient with proper configuration
    const clientOptions: ClientOptions = {
      apiHost: 'https://cdn.growthbook.io',
      clientKey: 'sdk-abc123',
    };
    this._gbClient = new GrowthBookClient(clientOptions);

    // Create features for testing
    const features = this._createTestFeatures();

    this._gbClient.initSync({
      payload: { features },
    });
  }

  public isOn(featureKey: string, ..._rest: unknown[]): boolean {
    return this._gbClient.isOn(featureKey, this._userContext);
  }

  public getFeatureValue(featureKey: string, defaultValue: unknown, ..._rest: unknown[]): unknown {
    return this._gbClient.getFeatureValue(featureKey, defaultValue as boolean | string | number, this._userContext);
  }

  private _createTestFeatures(): Record<string, { defaultValue: unknown }> {
    const features: Record<string, { defaultValue: unknown }> = {};

    // Fill buffer with flags 1-100 (all false by default)
    for (let i = 1; i <= FLAG_BUFFER_SIZE; i++) {
      features[`feat${i}`] = { defaultValue: false };
    }

    // Add feat101 (true), which should evict feat1
    features[`feat${FLAG_BUFFER_SIZE + 1}`] = { defaultValue: true };

    // Update feat3 to true, which should move it to the end
    features['feat3'] = { defaultValue: true };

    // Test features with boolean values (should be captured)
    features['bool-feat'] = { defaultValue: true };

    // Test features with non-boolean values (should NOT be captured)
    features['string-feat'] = { defaultValue: 'hello' };
    features['number-feat'] = { defaultValue: 42 };

    return features;
  }
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.growthbookIntegration({ growthbookClass: GrowthBookWrapper })],
});

// Create GrowthBookWrapper instance
const gb = new GrowthBookWrapper();

// Fill buffer with flags 1-100 (all false by default)
for (let i = 1; i <= FLAG_BUFFER_SIZE; i++) {
  gb.isOn(`feat${i}`);
}

// Add feat101 (true), which should evict feat1
gb.isOn(`feat${FLAG_BUFFER_SIZE + 1}`);

// Update feat3 to true, which should move it to the end
gb.isOn('feat3');

// Test getFeatureValue with boolean values (should be captured)
gb.getFeatureValue('bool-feat', false);

// Test getFeatureValue with non-boolean values (should NOT be captured)
gb.getFeatureValue('string-feat', 'default');
gb.getFeatureValue('number-feat', 0);

throw new Error('Test error');

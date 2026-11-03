import type { ClientOptions, InitSyncOptions, UserContext } from '@growthbook/growthbook';
import { GrowthBookClient } from '@growthbook/growthbook';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Wrapper class to instantiate GrowthBookClient
class GrowthBookWrapper {
  private _gbClient: GrowthBookClient;
  private _userContext: UserContext = { attributes: { id: 'test-user-123' } };

  public constructor(..._args: unknown[]) {
    // Create GrowthBookClient and initialize it synchronously with payload
    const clientOptions: ClientOptions = {
      apiHost: 'https://cdn.growthbook.io',
      clientKey: 'sdk-abc123',
    };
    this._gbClient = new GrowthBookClient(clientOptions);

    // Create test features
    const features = {
      feat1: { defaultValue: true },
      feat2: { defaultValue: false },
      'bool-feat': { defaultValue: true },
      'string-feat': { defaultValue: 'hello' },
    };

    // Initialize synchronously with payload
    const initOptions: InitSyncOptions = {
      payload: { features },
    };

    this._gbClient.initSync(initOptions);
  }

  public isOn(featureKey: string, ..._rest: unknown[]): boolean {
    return this._gbClient.isOn(featureKey, this._userContext);
  }

  public getFeatureValue(featureKey: string, defaultValue: unknown, ..._rest: unknown[]): unknown {
    return this._gbClient.getFeatureValue(featureKey, defaultValue as boolean | string | number, this._userContext);
  }
}

const gb = new GrowthBookWrapper();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.growthbookIntegration({ growthbookClass: GrowthBookWrapper })],
});

Sentry.startSpan({ name: 'test-span', op: 'function' }, () => {
  // Evaluate feature flags during the span
  gb.isOn('feat1');
  gb.isOn('feat2');

  // Test getFeatureValue with boolean values (should be captured)
  gb.getFeatureValue('bool-feat', false);

  // Test getFeatureValue with non-boolean values (should NOT be captured)
  gb.getFeatureValue('string-feat', 'default');
});

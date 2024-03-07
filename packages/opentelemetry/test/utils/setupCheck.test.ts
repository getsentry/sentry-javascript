import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

import { SentrySampler } from '../../src/sampler';
import { SentrySpanProcessor } from '../../src/spanProcessor';
import { openTelemetrySetupCheck } from '../../src/utils/setupCheck';
import { TestClient, getDefaultTestClientOptions } from '../helpers/TestClient';
import { setupOtel } from '../helpers/initOtel';
import { cleanupOtel } from '../helpers/mockSdkInit';

describe('openTelemetrySetupCheck', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    cleanupOtel(provider);
  });

  afterEach(() => {
    cleanupOtel(provider);
  });

  it('returns empty array by default', () => {
    const setup = openTelemetrySetupCheck();
    expect(setup).toEqual([]);
  });

  it('returns all setup parts', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    provider = setupOtel(client);

    const setup = openTelemetrySetupCheck();
    expect(setup).toEqual(['SentrySampler', 'SentrySpanProcessor', 'SentryPropagator', 'SentryContextManager']);
  });

  it('returns partial setup parts', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    provider = new BasicTracerProvider({
      sampler: new SentrySampler(client),
    });
    provider.addSpanProcessor(new SentrySpanProcessor());

    const setup = openTelemetrySetupCheck();
    expect(setup).toEqual(['SentrySampler', 'SentrySpanProcessor']);
  });
});

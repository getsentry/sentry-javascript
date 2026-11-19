import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, setCurrentClient } from '../../../src';
import { defineIntegration, getIntegrationsToSetup } from '../../../src/integration';
import type { Integration } from '../../../src/types/integration';
import { experimentalReportSdkConfigIntegration } from '../../../src/integrations/reportSdkConfig';
import type * as metricsApi from '../../../src/metrics/public-api';
import { count } from '../../../src/metrics/public-api';
import { captureOptionsSetByUser } from '../../../src/utils/sdkMetadata';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

vi.mock('../../../src/metrics/public-api', async importOriginal => ({
  ...(await importOriginal<typeof metricsApi>()),
  count: vi.fn(),
}));

const tagIntegration = defineIntegration((_options: { tag?: string; filter?: RegExp } = {}) => ({ name: 'Tag' }));

function reportConfig(options: ReturnType<typeof getDefaultTestClientOptions>): Record<string, unknown> {
  let payload: Record<string, unknown> = {};
  vi.mocked(count).mockImplementation((_name, _value, metricOptions) => {
    payload = JSON.parse(String(metricOptions?.attributes?.['sentry.sdk_config.payload']));
  });

  const client = new TestClient(options);
  setCurrentClient(client);
  client.init();
  client.emit('flush');

  return payload;
}

describe('experimentalReportSdkConfigIntegration', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.clearAllMocks();
  });

  it('reports only the options the user passed, without SDK defaults or per-deployment values', () => {
    const userOptions = captureOptionsSetByUser({
      tracesSampleRate: 0.5,
      environment: 'staging',
      defaultIntegrations: false,
      integrations: [experimentalReportSdkConfigIntegration(), tagIntegration({ tag: 'checkout', filter: /cart/ })],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        sendDefaultPii: false,
        ...userOptions,
      }),
    );

    expect(payload).toEqual({
      version: 2,
      options: {
        defaultIntegrations: false,
        integrations: [{ name: 'ExperimentalReportSdkConfig' }, { name: 'Tag' }],
        tracesSampleRate: 0.5,
      },
    });
  });

  it('reports the names of the default integrations the user passed', () => {
    const userOptions = captureOptionsSetByUser({
      defaultIntegrations: [experimentalReportSdkConfigIntegration()],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        ...userOptions,
        integrations: userOptions.defaultIntegrations || [],
      }),
    );

    expect(payload.options).toEqual({ defaultIntegrations: [{ name: 'ExperimentalReportSdkConfig' }] });
  });

  it('reports the integrations an `integrations` function returns, without the options of kept defaults', () => {
    const userOptions = captureOptionsSetByUser({
      integrations: (defaults: Integration[]) => [
        ...defaults.filter(integration => integration.name !== 'Dropped'),
        tagIntegration({ tag: 'user' }),
        experimentalReportSdkConfigIntegration(),
      ],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        integrations: getIntegrationsToSetup({
          defaultIntegrations: [
            defineIntegration((_options: { sdkSet?: boolean } = {}) => ({ name: 'Kept' }))({ sdkSet: true }),
            defineIntegration(() => ({ name: 'Dropped' }))(),
          ],
          integrations: userOptions.integrations,
        }),
        _metadata: userOptions._metadata,
      }),
    );

    expect(payload.options).toEqual({
      integrations: [{ name: 'Kept' }, { name: 'Tag' }, { name: 'ExperimentalReportSdkConfig' }],
    });
  });

  it('reports no options when the user-set options were not captured', () => {
    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1,
        integrations: [experimentalReportSdkConfigIntegration()],
      }),
    );

    expect(payload.options).toEqual({});
  });
});

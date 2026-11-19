import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, setCurrentClient } from '../../../src';
import { getIntegrationsToSetup } from '../../../src/integration';
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

  it('reports SDK and deployment metadata alongside user-set options', () => {
    const userOptions = captureOptionsSetByUser({
      tracesSampleRate: 0.5,
      runtime: { name: 'node', version: 'v24.22.1' },
      release: 'shop@1.4.2',
      environment: 'staging',
      dist: '42',
      serverName: 'web-7f9c',
      defaultIntegrations: false,
      integrations: [experimentalReportSdkConfigIntegration(), { name: 'Tag' }],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        sendDefaultPii: false,
        ...userOptions,
        _metadata: {
          ...userOptions._metadata,
          sdk: { name: 'sentry.javascript.node', version: '11.14.0' },
        },
      }),
    );

    expect(payload).toEqual({
      version: 2,
      sdk: { name: 'sentry.javascript.node', version: '11.14.0' },
      runtime: { name: 'node', version: 'v24.22.1' },
      release: 'shop@1.4.2',
      environment: 'staging',
      dist: '42',
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

  it('reports the integration names returned by an integrations callback', () => {
    const userOptions = captureOptionsSetByUser({
      integrations: (defaults: Integration[]) => [
        ...defaults.filter(integration => integration.name !== 'Dropped'),
        { name: 'Tag' },
        experimentalReportSdkConfigIntegration(),
      ],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        integrations: getIntegrationsToSetup({
          defaultIntegrations: [{ name: 'Kept' }, { name: 'Dropped' }],
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

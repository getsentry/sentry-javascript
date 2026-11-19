import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  vi.advanceTimersByTime(0);

  return payload;
}

describe('experimentalReportSdkConfigIntegration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.clearAllMocks();
    vi.useRealTimers();
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
      integrations: [{ name: 'ExperimentalReportSdkConfig' }, { name: 'Tag' }],
      options: {
        runtime: { name: 'node', version: 'v24.22.1' },
        release: 'shop@1.4.2',
        environment: 'staging',
        dist: '42',
        defaultIntegrations: false,
        tracesSampleRate: 0.5,
      },
    });
  });

  it('reports resolved metadata only at the top level when it was not explicitly supplied', () => {
    const userOptions = captureOptionsSetByUser({
      integrations: [experimentalReportSdkConfigIntegration()],
    });
    const resolvedOptions = {
      runtime: { name: 'node', version: 'v24.22.1' },
      release: 'shop@1.4.2',
      environment: 'staging',
      dist: '42',
    };

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        ...resolvedOptions,
        ...userOptions,
      }),
    );

    expect(payload).toEqual({
      version: 2,
      ...resolvedOptions,
      integrations: [{ name: 'ExperimentalReportSdkConfig' }],
      options: {},
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

  it('reports the resolved integrations after an integrations callback', () => {
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

    expect(payload).toEqual({
      version: 2,
      integrations: [{ name: 'Kept' }, { name: 'Tag' }, { name: 'ExperimentalReportSdkConfig' }],
      options: {},
    });
  });

  it('reports installed integrations even when user-set options were not captured', () => {
    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1,
        integrations: [experimentalReportSdkConfigIntegration()],
      }),
    );

    expect(payload).toEqual({
      version: 2,
      integrations: [{ name: 'ExperimentalReportSdkConfig' }],
      options: {},
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      dsn: 'https://username@domain/123',
      tracesSampleRate: 0.5,
      runtime: { name: 'node', version: 'v24.22.1' },
      release: 'shop@1.4.2',
      environment: 'staging',
      dist: '42',
      serverName: 'web-7f9c',
      defaultIntegrations: false,
      integrations: [experimentalReportSdkConfigIntegration(), tagIntegration({ tag: 'checkout', filter: /cart/ })],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        sendDefaultPii: false,
        ...userOptions,
        _metadata: {
          ...userOptions._metadata,
          sdk: { name: 'sentry.javascript.node', version: '11.14.0' },
        },
      }),
    );

    expect(payload).toEqual({
      version: 3,
      sdk: { name: 'sentry.javascript.node', version: '11.14.0' },
      runtime: { name: 'node', version: 'v24.22.1' },
      environment: 'staging',
      options: {
        runtime: { name: 'node', version: 'v24.22.1' },
        environment: 'staging',
        defaultIntegrations: false,
        integrations: [
          { name: 'ExperimentalReportSdkConfig' },
          { name: 'Tag', options: { filter: '/cart/', tag: 'checkout' } },
        ],
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
      environment: 'staging',
    };

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        release: 'shop@1.4.2',
        dist: '42',
        ...resolvedOptions,
        ...userOptions,
      }),
    );

    expect(payload).toEqual({
      version: 3,
      ...resolvedOptions,
      options: { integrations: [{ name: 'ExperimentalReportSdkConfig' }] },
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

  it('reports an integrations callback as the integrations it added and the sorted defaults it removed', () => {
    const userOptions = captureOptionsSetByUser({
      integrations: (defaults: Integration[]) => [
        ...defaults.filter(integration => integration.name === 'Kept'),
        tagIntegration({ tag: 'user' }),
        experimentalReportSdkConfigIntegration(),
      ],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        integrations: getIntegrationsToSetup({
          defaultIntegrations: [{ name: 'Zeta' }, { name: 'Kept' }, { name: 'Dropped' }],
          integrations: userOptions.integrations,
        }),
        _metadata: userOptions._metadata,
      }),
    );

    expect(payload).toEqual({
      version: 3,
      removed_default_integrations: ['Dropped', 'Zeta'],
      options: {
        integrations: [{ name: 'Tag', options: { tag: 'user' } }, { name: 'ExperimentalReportSdkConfig' }],
      },
    });
  });

  it('reports the same payload for an integrations callback and an array that add the same integrations', () => {
    const fromArray = captureOptionsSetByUser({ integrations: [tagIntegration({ tag: 'user' })] });
    const fromCallback = captureOptionsSetByUser({
      integrations: (defaults: Integration[]) => [...defaults, tagIntegration({ tag: 'user' })],
    });
    const defaultIntegrations = [experimentalReportSdkConfigIntegration()];

    const payloads = [fromArray, fromCallback].map(userOptions =>
      reportConfig(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          integrations: getIntegrationsToSetup({ defaultIntegrations, integrations: userOptions.integrations }),
          _metadata: userOptions._metadata,
        }),
      ),
    );

    expect(payloads[0]).toEqual({ version: 3, options: { integrations: [{ name: 'Tag', options: { tag: 'user' } }] } });
    expect(payloads[1]).toEqual(payloads[0]);
  });

  it('reports integration options as passed, even when the integration writes into them', () => {
    const mutatingIntegration = defineIntegration((options: { capture?: boolean } = {}) => {
      options.capture = false;

      return { name: 'Mutating' };
    });
    const userOptions = captureOptionsSetByUser({
      integrations: [experimentalReportSdkConfigIntegration(), mutatingIntegration({ capture: true })],
    });

    const payload = reportConfig(getDefaultTestClientOptions({ dsn: 'https://username@domain/123', ...userOptions }));

    expect(payload.options).toEqual({
      integrations: [{ name: 'ExperimentalReportSdkConfig' }, { name: 'Mutating', options: { capture: true } }],
    });
  });

  it('reports no integrations when user-set options were not captured', () => {
    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1,
        integrations: [experimentalReportSdkConfigIntegration()],
      }),
    );

    expect(payload).toEqual({ version: 3, options: {} });
  });
});

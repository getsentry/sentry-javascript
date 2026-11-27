import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, setCurrentClient } from '../../../src';
import { defineIntegration, getIntegrationsToSetup } from '../../../src/integration';
import type { Integration } from '../../../src/types/integration';
import { experimentalReportSdkConfigIntegration } from '../../../src/integrations/reportSdkConfig';
import type * as metricsApi from '../../../src/metrics/public-api';
import { count } from '../../../src/metrics/public-api';
import { isBrowser } from '../../../src/utils/isBrowser';
import { captureOptionsSetByUser } from '../../../src/utils/sdkMetadata';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

vi.mock('../../../src/metrics/public-api', async importOriginal => ({
  ...(await importOriginal<typeof metricsApi>()),
  count: vi.fn(),
}));

vi.mock('../../../src/utils/isBrowser', () => ({ isBrowser: vi.fn(() => false) }));

const tagIntegration = defineIntegration((_options: { tag?: string; filter?: RegExp } = {}) => ({ name: 'Tag' }));

function reportConfig(options: ReturnType<typeof getDefaultTestClientOptions>): Record<string, unknown> {
  return JSON.parse(reportAttributes(options)['sentry.sdk_config.payload'] as string);
}

function reportAttributes(options: ReturnType<typeof getDefaultTestClientOptions>): Record<string, unknown> {
  let attributes: Record<string, unknown> = {};
  vi.mocked(count).mockImplementation((_name, _value, metricOptions) => {
    attributes = metricOptions?.attributes ?? {};
  });

  const client = new TestClient(options);
  setCurrentClient(client);
  client.init();
  vi.advanceTimersByTime(0);

  return attributes;
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
      version: 4,
      sdk: { name: 'sentry.javascript.node', version: '11.14.0' },
      runtime: { name: 'node', version: 'v24.22.1' },
      options: {
        runtime: { name: 'node', version: 'v24.22.1' },
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
      version: 4,
      runtime: resolvedOptions.runtime,
      options: { integrations: [{ name: 'ExperimentalReportSdkConfig' }] },
    });
  });

  it('reports the same payload for every environment, so environments share a hash', () => {
    const payloads = ['staging', 'production'].map(environment =>
      reportConfig(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          ...captureOptionsSetByUser({ environment, integrations: [experimentalReportSdkConfigIntegration()] }),
        }),
      ),
    );

    expect(payloads[1]).toEqual(payloads[0]);
    expect(payloads[0]).toEqual({ version: 4, options: { integrations: [{ name: 'ExperimentalReportSdkConfig' }] } });
  });

  it('reports a browser runtime when the client sets none', () => {
    vi.mocked(isBrowser).mockReturnValueOnce(true);

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        integrations: [experimentalReportSdkConfigIntegration()],
      }),
    );

    expect(payload.runtime).toEqual({ name: 'browser' });
  });

  it('reports no runtime outside the browser when the client sets none', () => {
    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        integrations: [experimentalReportSdkConfigIntegration()],
      }),
    );

    expect(payload).not.toHaveProperty('runtime');
  });

  it('reports a different hash for a different runtime', () => {
    const options = { dsn: 'https://username@domain/123', integrations: [experimentalReportSdkConfigIntegration()] };
    // Server clients set the runtime; the test client's options type doesn't declare it.
    const nodeRuntime = { runtime: { name: 'node', version: 'v24.22.1' } };
    const otherNodeRuntime = { runtime: { name: 'node', version: 'v26.0.0' } };

    const node = reportAttributes(getDefaultTestClientOptions({ ...options, ...nodeRuntime }));
    const otherNode = reportAttributes(getDefaultTestClientOptions({ ...options, ...otherNodeRuntime }));
    vi.mocked(isBrowser).mockReturnValueOnce(true);
    const browser = reportAttributes(getDefaultTestClientOptions(options));

    expect(new Set([node, otherNode, browser].map(attributes => attributes['sentry.sdk_config.hash'])).size).toBe(3);
  });

  it('reports non-finite numbers as markers, so they differ from null', () => {
    const userOptions = captureOptionsSetByUser({
      tracesSampleRate: NaN,
      sampleRate: Infinity,
      profileSessionSampleRate: -Infinity,
      maxBreadcrumbs: null as unknown as number,
      integrations: [experimentalReportSdkConfigIntegration()],
    });

    const payload = reportConfig(getDefaultTestClientOptions({ dsn: 'https://username@domain/123', ...userOptions }));

    expect(payload.options).toEqual({
      integrations: [{ name: 'ExperimentalReportSdkConfig' }],
      maxBreadcrumbs: null,
      profileSessionSampleRate: '[-Infinity]',
      sampleRate: '[Infinity]',
      tracesSampleRate: '[NaN]',
    });
  });

  it('reports only the shape of initialScope, so per-user values neither leave the app nor split the hash', () => {
    const payloads = ['42', '43'].map(id =>
      reportConfig(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          ...captureOptionsSetByUser({
            initialScope: {
              user: { id, email: `${id}@example.com` },
              tags: { plan: 'pro' },
              level: 'warning' as const,
              fingerprint: [id],
            },
            integrations: [experimentalReportSdkConfigIntegration()],
          }),
        }),
      ),
    );

    expect(payloads[1]).toEqual(payloads[0]);
    expect((payloads[0]?.options as Record<string, unknown>).initialScope).toEqual({
      fingerprint: '[value]',
      level: '[value]',
      tags: { plan: '[value]' },
      user: { email: '[value]', id: '[value]' },
    });
  });

  it('reports an initialScope callback as a function', () => {
    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        ...captureOptionsSetByUser({
          initialScope: scope => scope,
          integrations: [experimentalReportSdkConfigIntegration()],
        }),
      }),
    );

    expect((payload.options as Record<string, unknown>).initialScope).toMatch(/^\[Function:\w+\]$/);
  });

  it('reports callbacks that differ only in their local names as the same function', () => {
    const report = (beforeSend: (event: unknown) => unknown): Record<string, unknown> =>
      reportConfig(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          ...captureOptionsSetByUser({ beforeSend, integrations: [experimentalReportSdkConfigIntegration()] }),
        }),
      ).options as Record<string, unknown>;

    const original = report(event => event);
    const renamed = report(e => e);
    const dropsEverything = report(() => null);

    expect(renamed.beforeSend).toBe(original.beforeSend);
    expect(dropsEverything.beforeSend).not.toBe(original.beforeSend);
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

  it('reports the options of the default integrations the user passed', () => {
    const userOptions = captureOptionsSetByUser({
      defaultIntegrations: [experimentalReportSdkConfigIntegration(), tagIntegration({ tag: 'default' })],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        ...userOptions,
        integrations: getIntegrationsToSetup({ defaultIntegrations: userOptions.defaultIntegrations }),
      }),
    );

    expect(payload.options).toEqual({
      defaultIntegrations: [{ name: 'ExperimentalReportSdkConfig' }, { name: 'Tag', options: { tag: 'default' } }],
    });
  });

  it('reports the integrations an integrations callback adds to or removes from the defaults in place', () => {
    const added = captureOptionsSetByUser({
      integrations: (defaults: Integration[]) => {
        defaults.push(tagIntegration({ tag: 'user' }));

        return defaults;
      },
    });
    const removed = captureOptionsSetByUser({
      integrations: (defaults: Integration[]) => {
        defaults.splice(1, 1);

        return defaults;
      },
    });

    const [addedPayload, removedPayload] = [added, removed].map(userOptions =>
      reportConfig(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          integrations: getIntegrationsToSetup({
            defaultIntegrations: [experimentalReportSdkConfigIntegration(), { name: 'Dropped' }],
            integrations: userOptions.integrations,
          }),
          _metadata: userOptions._metadata,
        }),
      ),
    );

    expect(addedPayload).toEqual({
      version: 4,
      options: { integrations: [{ name: 'Tag', options: { tag: 'user' } }] },
    });
    expect(removedPayload).toEqual({
      version: 4,
      removed_default_integrations: ['Dropped'],
      options: { integrations: [] },
    });
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
      version: 4,
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

    expect(payloads[0]).toEqual({ version: 4, options: { integrations: [{ name: 'Tag', options: { tag: 'user' } }] } });
    expect(payloads[1]).toEqual(payloads[0]);
  });

  it('reports an integrations callback that returns a single integration', () => {
    const userOptions = captureOptionsSetByUser({
      integrations: (() => tagIntegration({ tag: 'only' })) as unknown as (defaults: Integration[]) => Integration[],
    });

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        integrations: [
          experimentalReportSdkConfigIntegration(),
          ...getIntegrationsToSetup({
            defaultIntegrations: [{ name: 'Dropped' }],
            integrations: userOptions.integrations,
          }),
        ],
        _metadata: userOptions._metadata,
      }),
    );

    expect(payload).toEqual({
      version: 4,
      removed_default_integrations: ['Dropped'],
      options: { integrations: [{ name: 'Tag', options: { tag: 'only' } }] },
    });
  });

  it('does not report the integrations an SDK passes to the integrations callback as set by the user', () => {
    const userOptions = captureOptionsSetByUser({
      integrations: (defaults: Integration[]) => [...defaults, tagIntegration({ tag: 'user' })],
    });
    const userIntegrations = userOptions.integrations as (defaults: Integration[]) => Integration[];

    const payload = reportConfig(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        integrations: getIntegrationsToSetup({
          defaultIntegrations: [experimentalReportSdkConfigIntegration()],
          // How the Next.js SDK adds the integrations of Bun, Deno and Cloudflare.
          integrations: defaults => userIntegrations([...defaults, { name: 'AddedBySdk' }]),
        }),
        _metadata: userOptions._metadata,
      }),
    );

    expect(payload.options).toEqual({ integrations: [{ name: 'Tag', options: { tag: 'user' } }] });
  });

  it('reports objects in integration options as placeholders, so live app objects are not sent', () => {
    class SupabaseClient {
      public supabaseKey = 'service-role-key';
    }
    const routerIntegration = defineIntegration(
      (_options: { router?: unknown; routes?: unknown[]; instrumentNavigation?: boolean } = {}) => ({
        name: 'Router',
      }),
    );
    const clientIntegration = defineIntegration((_options: { supabaseClient: unknown }) => ({ name: 'Supabase' }));
    const storeIntegration = defineIntegration((_store: unknown) => ({ name: 'Store' }));
    const userOptions = captureOptionsSetByUser({
      integrations: [
        experimentalReportSdkConfigIntegration(),
        routerIntegration({
          router: { currentRoute: { fullPath: '/account?email=jane@example.com' } },
          routes: ['/users', /^\/admin/, { path: '/account' }],
          instrumentNavigation: false,
        }),
        clientIntegration({ supabaseClient: new SupabaseClient() }),
        storeIntegration({ state: { user: { email: 'jane@example.com' } }, _s: new Map() }),
      ],
    });

    const payload = reportConfig(getDefaultTestClientOptions({ dsn: 'https://username@domain/123', ...userOptions }));

    expect(payload.options).toEqual({
      integrations: [
        { name: 'ExperimentalReportSdkConfig' },
        {
          name: 'Router',
          options: { instrumentNavigation: false, router: '[Object]', routes: ['/users', '/^\\/admin/', '[Object]'] },
        },
        { name: 'Supabase', options: { supabaseClient: '[Object]' } },
        { name: 'Store', options: { _s: '[Object]', state: '[Object]' } },
      ],
    });
  });

  it('reports library functions in integration options without a fingerprint, unlike user callbacks', () => {
    const routerIntegration = defineIntegration(
      (_options: { useLocation?: () => unknown; shouldCreateSpan?: () => boolean } = {}) => ({ name: 'Router' }),
      { libraryOptions: ['useLocation'] },
    );
    const reportRouter = (useLocation: () => unknown): Record<string, unknown> =>
      reportConfig(
        getDefaultTestClientOptions({
          dsn: 'https://username@domain/123',
          ...captureOptionsSetByUser({
            integrations: [
              experimentalReportSdkConfigIntegration(),
              routerIntegration({ useLocation, shouldCreateSpan: () => false }),
            ],
          }),
        }),
      );

    const payload = reportRouter(() => 'react-router@6');

    expect(payload.options).toEqual({
      integrations: [
        { name: 'ExperimentalReportSdkConfig' },
        {
          name: 'Router',
          options: { shouldCreateSpan: expect.stringMatching(/^\[Function:\w+\]$/), useLocation: '[Function]' },
        },
      ],
    });
    expect(reportRouter(() => 'react-router@7')).toEqual(payload);
  });

  it('reports library objects as placeholders and keeps library primitives', () => {
    const routerIntegration = defineIntegration(
      (_options: { history?: unknown; routes?: unknown[]; version?: string; basename?: string } = {}) => ({
        name: 'Router',
      }),
      { libraryOptions: ['history', 'routes', 'version'] },
    );
    const userOptions = captureOptionsSetByUser({
      integrations: [
        experimentalReportSdkConfigIntegration(),
        routerIntegration({ history: { length: 1 }, routes: ['/users'], version: '6.22.0', basename: '/app' }),
      ],
    });

    const payload = reportConfig(getDefaultTestClientOptions({ dsn: 'https://username@domain/123', ...userOptions }));

    expect(payload.options).toEqual({
      integrations: [
        { name: 'ExperimentalReportSdkConfig' },
        { name: 'Router', options: { basename: '/app', history: '[Object]', routes: '[Object]', version: '6.22.0' } },
      ],
    });
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

    expect(payload).toEqual({ version: 4, options: {} });
  });
});

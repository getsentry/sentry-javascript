import type { Event, SeverityLevel } from '@sentry/types';

export function Transaction(obj?: Partial<Event>): any {
  const timestamp = new Date().getTime() / 1000;

  return {
    contexts: {
      // {{{
      organization: {
        id: '1',
        slug: 'sentry-emerging-tech',
      },
      trace: {
        op: 'navigation',
        span_id: 'b44b173b1c74a782',
        tags: {
          'routing.instrumentation': 'react-router-v3',
          from: '/organizations/:orgId/replays/',
          'ui.longTaskCount.grouped': '<=1',
          effectiveConnectionType: '4g',
          deviceMemory: '8 GB',
          hardwareConcurrency: '10',
          sentry_reportAllChanges: false,
        },
        trace_id: 'trace_id',
      },
    }, // }}}
    spans: [
      // {{{
      {
        description: '<LoadingIndicator>',
        op: 'ui.react.mount',
        parent_span_id: 'b44b173b1c74a782',
        span_id: '9ea106e8efbce4a0',
        start_timestamp: 1668184224.4743,
        timestamp: 1668184224.5091,
        trace_id: '3e0ff8aff4dc4236a80b77a37ef66c7d',
      },
      {
        description: '<App>',
        op: 'ui.react.update',
        parent_span_id: 'b44b173b1c74a782',
        span_id: 'b4c7b421761d903a',
        start_timestamp: 1668184224.4843998,
        timestamp: 1668184224.5091999,
        trace_id: '3e0ff8aff4dc4236a80b77a37ef66c7d',
      },
      {
        description: 'Main UI thread blocked',
        op: 'ui.long-task',
        parent_span_id: 'b44b173b1c74a782',
        span_id: '808967f15cae9251',
        start_timestamp: 1668184224.4343,
        timestamp: 1668184224.5483,
        trace_id: '3e0ff8aff4dc4236a80b77a37ef66c7d',
      },
      {
        data: {
          method: 'GET',
          url: '/api/0/projects/sentry-emerging-tech/billy-test/replays/c11bd625b0e14081a0827a22a0a9be4e/',
          type: 'fetch',
        },
        description: 'GET /api/0/projects/sentry-emerging-tech/billy-test/replays/c11bd625b0e14081a0827a22a0a9be4e/',
        op: 'http.client',
        parent_span_id: 'b44b173b1c74a782',
        span_id: '87497c337838d561',
        start_timestamp: 1668184224.7844,
        status: 'ok',
        tags: {
          'http.status_code': '200',
        },
        timestamp: 1668184225.0802999,
        trace_id: '3e0ff8aff4dc4236a80b77a37ef66c7d',
      },
      {
        data: {
          'Transfer Size': 1097,
          'Encoded Body Size': 797,
          'Decoded Body Size': 1885,
        },
        description: '/favicon.ico',
        op: 'resource.other',
        parent_span_id: 'b44b173b1c74a782',
        span_id: 'b7fad2cd42783af4',
        start_timestamp: 1668184224.5532,
        timestamp: 1668184224.5562,
        trace_id: '3e0ff8aff4dc4236a80b77a37ef66c7d',
      },
    ], // }}}
    start_timestamp: 1668184224.447,
    tags: {
      organization: '1',
      'organization.slug': 'sentry-emerging-tech',
      plan: 'am1_business_ent_auf',
      'plan.name': 'Business',
      'plan.max_members': 'null',
      'plan.total_members': '15',
      'plan.tier': 'am1',
      'routing.instrumentation': 'react-router-v3',
      from: '/organizations/:orgId/replays/',
      'ui.longTaskCount.grouped': '<=1',
      effectiveConnectionType: '4g',
      deviceMemory: '8 GB',
      hardwareConcurrency: '10',
      sentry_reportAllChanges: false,
      'timeOrigin.mode': 'navigationStart',
    },
    transaction: '/organizations/:orgId/replays/:replaySlug/',
    type: 'transaction' as const,
    sdkProcessingMetadata: {
      // {{{
      source: 'route',
      dynamicSamplingContext: {
        environment: 'prod',
        release: 'frontend@22.11.0+e5bd7ea3280849b58158c7adf1505e7d950e7f31',
        transaction: '/organizations/:orgId/replays/:replaySlug/',
        public_key: '6991720ac36e4ddd9f8dc3331187628f',
        trace_id: '3e0ff8aff4dc4236a80b77a37ef66c7d',
        sample_rate: '1',
      },
      spanMetadata: {
        '9ea106e8efbce4a0': {
          logMessage:
            "[Tracing] Starting 'ui.react.mount' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        b4c7b421761d903a: {
          logMessage:
            "[Tracing] Starting 'ui.react.update' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '808967f15cae9251': {
          logMessage:
            "[Tracing] Starting 'ui.long-task' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '9a0de85dfd88085c': {
          logMessage:
            "[Tracing] Starting 'ui.react.render' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '863c6099f1929910': {
          logMessage:
            "[Tracing] Starting 'ui.react.update' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '87497c337838d561': {
          logMessage:
            "[Tracing] Starting 'http.client' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '81638bb5251f9e3f': {
          logMessage:
            "[Tracing] Starting 'http.client' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        bf25ff92b2dc7498: {
          logMessage:
            "[Tracing] Starting 'ui.long-task' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        a7c3320e88b04076: {
          logMessage:
            "[Tracing] Starting 'ui.react.update' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '95c892e987b8e0f5': {
          logMessage:
            "[Tracing] Starting 'ui.long-task' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        b734c15c4d94b7b6: {
          logMessage:
            "[Tracing] Starting 'ui.long-task' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '934881bfe9a8e043': {
          logMessage:
            "[Tracing] Starting 'http.client' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '9bc8a019012e4692': {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        b3c5eb78c15aa492: {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '84a72c34a78232b7': {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        b523103902ac1f0d: {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '84f863de30175a64': {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        b0532b585ec47f05: {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '9c3612dc22c5aea5': {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '82b74a44ef06ae13': {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        b2d11e8d407329fd: {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        '98146db11c338f31': {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        a05774f4b2885c47: {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        a0c0d4f8ec6bfcd7: {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        ab2e6ef0852bfc64: {
          logMessage:
            "[Tracing] Starting 'resource.script' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
        b7fad2cd42783af4: {
          logMessage:
            "[Tracing] Starting 'resource.other' span on transaction '/organizations/:orgId/replays/:replaySlug/' (b44b173b1c74a782).",
        },
      },
      changes: [],
      propagations: 2,
      sampleRate: 1,
    }, // }}}
    transaction_info: {
      source: 'route',
      changes: [],
      propagations: 2,
    },
    measurements: {
      longTaskCount: {
        value: 0,
        unit: '',
      },
      longTaskDuration: {
        value: 0,
        unit: '',
      },
    },
    platform: 'javascript',
    event_id: 'f02630b140c0431fb6c8809f5b06d8be',
    environment: 'prod',
    release: 'frontend@22.11.0',
    sdk: {
      integrations: [
        'InboundFilters',
        'FunctionToString',
        'TryCatch',
        'Breadcrumbs',
        'GlobalHandlers',
        'LinkedErrors',
        'Dedupe',
        'HttpContext',
        'ExtraErrorData',
        'BrowserTracing',
      ],
      name: 'sentry.javascript.react',
      version: '7.18.0',
      packages: [
        {
          name: 'npm:@sentry/react',
          version: '7.18.0',
        },
      ],
    },
    user: {
      ip_address: '0.0.0.0',
      email: 'billy@sentry.io',
      id: '1',
      name: 'Billy Vong',
    },
    breadcrumbs: [
      {
        timestamp,
        category: 'console',
        data: {
          arguments: [
            'Warning: componentWillMount has been renamed, and is not recommended for use. See https://reactjs.org/link/unsafe-component-lifecycles for details.\n\n* Move code with side effects to componentDidMount, and set initial state in the constructor.\n* Rename componentWillMount to UNSAFE_componentWillMount to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run `npx react-codemod rename-unsafe-lifecycles` in your project source folder.\n\nPlease update the following components: %s',
            'Router, RouterContext',
          ],
          logger: 'console',
        },
        level: 'warning' as SeverityLevel,
        message:
          'Warning: componentWillMount has been renamed, and is not recommended for use. See https://reactjs.org/link/unsafe-component-lifecycles for details.\n\n* Move code with side effects to componentDidMount, and set initial state in the constructor.\n* Rename componentWillMount to UNSAFE_componentWillMount to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run `npx react-codemod rename-unsafe-lifecycles` in your project source folder.\n\nPlease update the following components: %s Router, RouterContext',
      },
    ],
    request: {
      url: 'https://example.org',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
      },
    },

    timestamp,
    ...obj,
  };
}

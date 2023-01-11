import type { SeverityLevel } from '@sentry/browser';
import type { Event } from '@sentry/types';

export function Error(obj?: Event): any {
  const timestamp = new Date().getTime() / 1000;

  return {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'testing error',
          stacktrace: {
            frames: [
              {
                filename: 'webpack-internal:///../../getsentry/static/getsentry/gsApp/components/replayInit.tsx',
                function: 'eval',
                in_app: true,
                lineno: 64,
                colno: 13,
              },
            ],
          },
          mechanism: {
            type: 'instrument',
            handled: true,
            data: {
              function: 'setTimeout',
            },
          },
        },
      ],
    },
    level: 'error' as SeverityLevel,
    event_id: 'event_id',
    platform: 'javascript',
    timestamp,
    environment: 'prod',
    release: 'frontend@22.11.0',
    sdk: {
      // {{{
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
    }, // }}}
    tags: {
      // {{{
      organization: '1',
      'organization.slug': 'sentry-emerging-tech',
      plan: 'am1_business_ent_auf',
      'plan.name': 'Business',
      'plan.max_members': 'null',
      'plan.total_members': '15',
      'plan.tier': 'am1',
      'timeOrigin.mode': 'navigationStart',
    }, // }}}
    user: {
      ip_address: '0.0.0.0',
      email: 'billy@sentry.io',
      id: '1',
      name: 'Billy Vong',
    },
    contexts: {
      organization: {
        id: '1',
        slug: 'sentry-emerging-tech',
      },
      Error: {},
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
        message:
          'Warning: componentWillMount has been renamed, and is not recommended for use. See https://reactjs.org/link/unsafe-component-lifecycles for details.\n\n* Move code with side effects to componentDidMount, and set initial state in the constructor.\n* Rename componentWillMount to UNSAFE_componentWillMount to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run `npx react-codemod rename-unsafe-lifecycles` in your project source folder.\n\nPlease update the following components: %s Router, RouterContext',
      },
    ],
    sdkProcessingMetadata: {},
    request: {
      url: 'https://example.org',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
      },
    },
    ...obj,
  };
}

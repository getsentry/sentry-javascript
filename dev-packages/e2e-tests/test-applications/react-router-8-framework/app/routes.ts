import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('__sentry-flush', 'routes/sentry-flush.tsx'),
  route('api/headers', 'routes/api/headers.ts'),
  route('isolation/:id', 'routes/isolation.ts'),
  route('logs', 'routes/logs.ts'),
  ...prefix('errors', [
    route('client', 'routes/errors/client.tsx'),
    route('client/:client-param', 'routes/errors/client-param.tsx'),
    route('client-loader', 'routes/errors/client-loader.tsx'),
    route('server-loader', 'routes/errors/server-loader.tsx'),
    route('client-action', 'routes/errors/client-action.tsx'),
    route('server-action', 'routes/errors/server-action.tsx'),
  ]),
  ...prefix('performance', [
    index('routes/performance/index.tsx'),
    route('ssr', 'routes/performance/ssr.tsx'),
    route('with/:param', 'routes/performance/dynamic-param.tsx'),
    route('static', 'routes/performance/static.tsx'),
    route('server-loader', 'routes/performance/server-loader.tsx'),
    route('server-action', 'routes/performance/server-action.tsx'),
    route('with-middleware', 'routes/performance/with-middleware.tsx'),
    route('redis', 'routes/performance/redis.tsx'),
    route('db-mysql', 'routes/performance/db-mysql.tsx'),
    route('outgoing-fetch', 'routes/performance/outgoing-fetch.ts'),
  ]),
] satisfies RouteConfig;

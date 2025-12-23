import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  ...prefix('performance', [
    index('routes/performance/index.tsx'),
    route('ssr', 'routes/performance/ssr.tsx'),
    route('with/:param', 'routes/performance/dynamic-param.tsx'),
    route('static', 'routes/performance/static.tsx'),
    route('server-loader', 'routes/performance/server-loader.tsx'),
    route('server-action', 'routes/performance/server-action.tsx'),
    route('with-middleware', 'routes/performance/with-middleware.tsx'),
    route('error-loader', 'routes/performance/error-loader.tsx'),
    route('error-action', 'routes/performance/error-action.tsx'),
    route('error-middleware', 'routes/performance/error-middleware.tsx'),
    route('lazy-route', 'routes/performance/lazy-route.tsx'),
    route('fetcher-test', 'routes/performance/fetcher-test.tsx'),
  ]),
] satisfies RouteConfig;

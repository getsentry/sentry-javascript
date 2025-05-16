import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
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
  ]),
] satisfies RouteConfig;

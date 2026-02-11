import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  ...prefix('errors', [
    route('client', 'routes/errors/client.tsx'),
    route('client/:client-param', 'routes/errors/client-param.tsx'),
    route('client-loader', 'routes/errors/client-loader.tsx'),
    route('client-action', 'routes/errors/client-action.tsx'),
  ]),
  ...prefix('performance', [
    index('routes/performance/index.tsx'),
    route('with/:param', 'routes/performance/dynamic-param.tsx'),
  ]),
] satisfies RouteConfig;

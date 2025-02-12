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
] satisfies RouteConfig;

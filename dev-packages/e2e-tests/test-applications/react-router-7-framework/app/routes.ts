import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  ...prefix('errors', [
    route('client', 'routes/errors/client.tsx'),
    route('client/:client-param', 'routes/errors/client-param.tsx'),
  ]),
] satisfies RouteConfig;

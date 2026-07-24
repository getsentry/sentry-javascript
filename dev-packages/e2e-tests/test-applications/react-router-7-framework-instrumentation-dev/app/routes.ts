import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  ...prefix('performance', [route('with-middleware', 'routes/performance/with-middleware.tsx')]),
] satisfies RouteConfig;

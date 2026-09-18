import { index, prefix, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  ...prefix('performance', [route('db-mysql', 'routes/performance/db-mysql.tsx')]),
] satisfies RouteConfig;

import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('db-mysql', 'routes/db-mysql.tsx'),
  route('db-ioredis', 'routes/db-ioredis.tsx'),
] satisfies RouteConfig;

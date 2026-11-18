import { type RouteConfig, route } from '@react-router/dev/routes';

export default [route('api/anchor', 'routes/anchor.ts'), route('api/error', 'routes/error.ts')] satisfies RouteConfig;

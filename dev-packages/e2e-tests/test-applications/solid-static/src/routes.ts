import { lazy } from 'solid-js';

import ErrorBoundaryExample from './pages/errorboundaryexample';
import Home from './pages/home';

export const routes = [
  {
    path: '/',
    component: Home,
  },
  {
    path: '/user/:id',
    component: lazy(() => import('./pages/user')),
  },
  {
    path: '/error-boundary-example',
    component: ErrorBoundaryExample,
  },
  {
    path: '**',
    component: lazy(() => import('./errors/404')),
  },
];

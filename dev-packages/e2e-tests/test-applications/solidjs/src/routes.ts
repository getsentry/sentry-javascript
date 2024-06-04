import { lazy } from 'solid-js';

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
    path: '**',
    component: lazy(() => import('./errors/404')),
  },
];

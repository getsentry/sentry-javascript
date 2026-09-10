import { createRouter, createWebHistory } from 'vue-router';
import DelayedView from '../views/DelayedView.vue';
import HomeView from '../views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: HomeView,
    },
    {
      // Loaded eagerly so the only async step on this route is the view's delayed child component.
      path: '/delayed',
      component: DelayedView,
    },
    {
      path: '/about',
      name: 'AboutView',
      component: () => import('../views/AboutView.vue'),
    },
    {
      path: '/users/:id',
      component: () => import('../views/UserIdView.vue'),
    },
    {
      path: '/users-error/:id',
      component: () => import('../views/UserIdErrorView.vue'),
    },
    {
      path: '/categories',
      children: [
        {
          path: ':id',
          component: () => import('../views/CategoryIdView.vue'),
        },
      ],
    },
    {
      path: '/components',
      component: () => import('../views/ComponentMainView.vue'),
    },
    {
      path: '/cart',
      component: () => import('../views/CartView.vue'),
    },
  ],
});

export default router;

import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: HomeView,
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
  ],
});

export default router;

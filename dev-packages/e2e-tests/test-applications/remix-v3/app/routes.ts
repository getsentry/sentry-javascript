import { get, route } from 'remix/routes';

export const routes = route({
  assets: get('/assets/*path'),
  home: '/',
  user: get('/users/:id'),
  teapot: get('/teapot'),
});

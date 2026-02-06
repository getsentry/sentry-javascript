import { wrapServerComponent } from '@sentry/react-router';

async function NotFoundServerComponent() {
  throw new Response('Not Found', { status: 404 });
}

export default wrapServerComponent(NotFoundServerComponent, {
  componentRoute: '/rsc/server-component-not-found',
  componentType: 'Page',
});

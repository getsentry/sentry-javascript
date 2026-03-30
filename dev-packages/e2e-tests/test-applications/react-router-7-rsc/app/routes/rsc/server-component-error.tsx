import { wrapServerComponent } from '@sentry/react-router';

async function ServerComponentWithError() {
  throw new Error('RSC Server Component Error: Mamma mia!');
}

export default wrapServerComponent(ServerComponentWithError, {
  componentRoute: '/rsc/server-component-error',
  componentType: 'Page',
});

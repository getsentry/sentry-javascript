import { redirect } from 'react-router';
import { wrapServerComponent } from '@sentry/react-router';

async function RedirectServerComponent() {
  throw redirect('/');
}

export default wrapServerComponent(RedirectServerComponent, {
  componentRoute: '/rsc/server-component-redirect',
  componentType: 'Page',
});

import { withSentryRouterRouting } from '@sentry/solid/solid2/solidrouter';
import { createRouter } from '@solidjs/router';
import Home from './Home';
import User from './User';

const Router = withSentryRouterRouting(
  createRouter({
    routes: [
      { path: '/', component: Home },
      { path: '/user/:id', component: User },
    ],
  }),
);

export default function App() {
  return <Router />;
}

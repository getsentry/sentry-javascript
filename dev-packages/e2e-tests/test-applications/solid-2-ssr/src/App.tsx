import { createRouter } from '@solidjs/router';
import Home from './Home';
import SsrError from './SsrError';

const Router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/ssr-error', component: SsrError },
  ],
});

export default function App() {
  return <Router />;
}

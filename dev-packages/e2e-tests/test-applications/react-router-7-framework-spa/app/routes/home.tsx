import type { Route } from './+types/home';
import { Link } from 'react-router';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
}

export default function Home() {
  return (
    <div>
      <h1>Hello,This is an SPA React Router app</h1>
      <div>
        <br />
        <br />
        <h2>Performance Pages, click pages to get redirected</h2>
        <ul>
          <li>
            <Link to="/performance">Performance page</Link>
          </li>
          <li>
            <Link to="/performance/static">Static Page</Link>
          </li>
          <li>
            <Link to="/performance/dynamic-param/123">Dynamic Parameter Page</Link>
          </li>
        </ul>
      </div>
      <div>
        <br />
        <h2>Error Pages, click button to trigger error</h2>
        <ul>
          <li>
            <Link to="/errors/client">Client Error</Link>
          </li>
          <li>
            <Link to="/errors/client-action">Client Action Error</Link>
          </li>
          <li>
            <Link to="/errors/client-loader">Client Loader Error</Link>
          </li>
          <li>
            <Link to="/errors/client-param/123">Client Parameter Error</Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

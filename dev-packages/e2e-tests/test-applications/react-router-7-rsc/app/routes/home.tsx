import { Link } from 'react-router';

export default function Home() {
  return (
    <main>
      <h1>React Router 7 RSC Test App</h1>
      <nav>
        <ul>
          <li>
            <Link to="/rsc/server-component">Server Component</Link>
          </li>
          <li>
            <Link to="/rsc/server-component-error">Server Component Error</Link>
          </li>
          <li>
            <Link to="/rsc/server-component-async">Server Component Async</Link>
          </li>
          <li>
            <Link to="/rsc/server-component/test-param">Server Component with Param</Link>
          </li>
          <li>
            <Link to="/rsc/server-function">Server Function</Link>
          </li>
          <li>
            <Link to="/rsc/server-function-error">Server Function Error</Link>
          </li>
          <li>
            <Link to="/performance">Performance</Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}

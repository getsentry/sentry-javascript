import { Link } from 'react-router';

// Minimal loader to trigger Sentry's route instrumentation
export function loader() {
  return null;
}

export default function PerformancePage() {
  return (
    <div>
      <h1>Performance Page</h1>
      <nav>
        <Link to="/performance/ssr">SSR Page</Link>
        <Link to="/performance/with/sentry">With Param Page</Link>
        <Link to="/performance/server-loader">Server Loader</Link>
      </nav>
    </div>
  );
}

import { Link, useNavigate } from 'react-router';

// Minimal loader to trigger Sentry's route instrumentation
export function loader() {
  return null;
}

export default function PerformancePage() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>Performance Page</h1>
      <nav>
        <Link to="/performance/ssr">SSR Page</Link>
        <Link to="/performance/with/sentry">With Param Page</Link>
        <Link to="/performance/server-loader">Server Loader</Link>
        <button type="button" onClick={() => navigate('ssr')}>
          Relative SSR Navigate
        </button>
      </nav>
    </div>
  );
}

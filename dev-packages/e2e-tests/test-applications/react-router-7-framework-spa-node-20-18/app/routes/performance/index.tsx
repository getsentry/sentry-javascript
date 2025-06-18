import { Link } from 'react-router';

export default function PerformancePage() {
  return (
    <div>
      <h1>Performance Page</h1>
      <nav>
        <Link to="/performance/with/sentry">With Param Page</Link>
      </nav>
    </div>
  );
}

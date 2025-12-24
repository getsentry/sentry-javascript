import { Link } from 'react-router';

export default function PerformancePage() {
  return (
    <main>
      <h1>Performance Test</h1>
      <nav>
        <ul>
          <li>
            <Link to="/performance/with/test-param">Dynamic Param</Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}

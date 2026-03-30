import { wrapServerComponent } from '@sentry/react-router';
import { Link } from 'react-router';

function PerformancePage() {
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

export default wrapServerComponent(PerformancePage, {
  componentRoute: '/performance',
  componentType: 'Page',
});

import { Link } from 'react-router';

export default function SsrPage() {
  return (
    <div>
      <h1>SSR Page</h1>
      <nav>
        <Link to="/performance">Back to Performance</Link>
      </nav>
    </div>
  );
}

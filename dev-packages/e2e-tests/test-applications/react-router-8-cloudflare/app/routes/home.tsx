import { Link } from 'react-router';

export default function Home() {
  return (
    <div>
      <h1>react-router-8-cloudflare</h1>
      <Link to="/performance/db-mysql">db-mysql</Link>
    </div>
  );
}

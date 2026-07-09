import { Link, useNavigate } from 'react-router';

export default function SsrPage() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>SSR Page</h1>
      <nav>
        <Link to="/performance">Back to Performance</Link>
      </nav>
      <button type="button" onClick={() => navigate(-1)}>
        History Back Navigate
      </button>
    </div>
  );
}

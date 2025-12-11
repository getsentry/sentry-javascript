import React from 'react';
import { Link, useParams } from 'react-router-dom';

// Simulate a slow async fetch during lazy route loading
// This delay happens before the module exports, simulating network latency
const fetchPromise = fetch('/api/slow-data')
  .then(res => res.json())
  .catch(() => ({ message: 'fallback data' }));

// Add a 500ms delay to simulate slow lazy loading
await new Promise(resolve => setTimeout(resolve, 500));

// Component that displays the lazy-loaded data
const SlowFetchComponent = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = React.useState<{ message: string } | null>(null);

  React.useEffect(() => {
    fetchPromise.then(setData);
  }, []);

  return (
    <div id="slow-fetch-content">
      <h1>Slow Fetch Route</h1>
      <p id="slow-fetch-id">ID: {id}</p>
      <p id="slow-fetch-data">Data: {data?.message || 'loading...'}</p>
      <Link to="/" id="slow-fetch-home-link">
        Go Home
      </Link>
      <Link to="/another-lazy/sub/999/888" id="slow-fetch-to-another">
        Go to Another Lazy Route
      </Link>
    </div>
  );
};

export const slowFetchRoutes = [
  {
    path: ':id',
    element: <SlowFetchComponent />,
  },
];

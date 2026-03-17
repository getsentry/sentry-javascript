import React from 'react';
import { Link } from 'react-router-dom';

// Simulates a slow lazy route load with a fetch request.
// This is used to reproduce the "span bleed" bug:
// The fetch span created here (during the navigation to /span-bleed/source)
// should only appear in the /span-bleed/source navigation transaction.
// With the bug, it incorrectly appears in the /span-bleed-destination transaction
// because the user navigates away before this 600ms delay resolves.
const fetchPromise = fetch('/api/span-bleed-data')
  .then(res => res.json())
  .catch(() => ({ message: 'fallback data' }));

// 600ms delay gives enough time to navigate away before this module resolves
await new Promise(resolve => setTimeout(resolve, 600));

const SpanBleedSourceComponent = () => {
  const [data, setData] = React.useState<{ message: string } | null>(null);

  React.useEffect(() => {
    fetchPromise.then(setData);
  }, []);

  return (
    <div id="span-bleed-source-content">
      <h1>Span Bleed Source Page</h1>
      <p>
        This page loaded with a 600ms delay + a fetch to <code>/api/span-bleed-data</code>.
      </p>
      <p>
        To reproduce the span bleed bug: navigate to this page, then quickly navigate to the destination page before
        the 600ms delay resolves. The fetch span from this page&apos;s loading should appear only in this page&apos;s
        navigation transaction — but with the bug it appears in the destination page&apos;s transaction.
      </p>
      <p id="span-bleed-source-data">Data: {data?.message || 'loading...'}</p>
      <Link to="/" id="span-bleed-source-home">
        Go Home
      </Link>
      <br />
      <Link to="/span-bleed-destination" id="span-bleed-source-to-destination">
        Go to Span Bleed Destination (next page)
      </Link>
    </div>
  );
};

export const spanBleedSourceRoutes = [
  {
    path: 'source',
    element: <SpanBleedSourceComponent />,
  },
];

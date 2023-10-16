import { useRouteError } from '@remix-run/react';
import { captureRemixErrorBoundaryError } from '@sentry/remix';
import { useState } from 'react';

export function ErrorBoundary() {
  const error = useRouteError();
  const eventId = captureRemixErrorBoundaryError(error);

  return (
    <div>
      <span>ErrorBoundary Error</span>
      <span id="event-id">{eventId}</span>
    </div>
  );
}

export default function ErrorBoundaryCapture() {
  const [count, setCount] = useState(0);

  if (count > 0) {
    throw new Error('Sentry React Component Error');
  } else {
    setTimeout(() => setCount(count + 1), 0);
  }

  return <div>{count}</div>;
}

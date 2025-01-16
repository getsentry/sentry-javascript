import { useState } from 'react';

export default function ErrorBoundaryCapture() {
  const [count, setCount] = useState(0);

  if (count > 0) {
    throw new Error('Sentry React Component Error');
  } else {
    setTimeout(() => setCount(count + 1), 0);
  }

  return <div>{count}</div>;
}

import {useEffect, useState} from 'react';

export default function ErrorBoundaryCapture() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count > 0) {
      throw new Error('Sentry React Component Error');
    } else {
      setTimeout(() => setCount(count + 1), 10);
    }
  }, [count]);

  return <div>{count}</div>;
}

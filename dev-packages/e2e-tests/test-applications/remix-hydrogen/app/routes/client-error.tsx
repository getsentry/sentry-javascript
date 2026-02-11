import { useSearchParams } from '@remix-run/react';
import * as Sentry from '@sentry/remix/cloudflare';

import { useState } from 'react';

export default function ErrorBoundaryCapture() {
  const [searchParams] = useSearchParams();

  if (searchParams.get('tag')) {
    Sentry.setTags({
      sentry_test: searchParams.get('tag'),
    });
  }

  const [count, setCount] = useState(0);

  if (count > 0) {
    throw new Error('Sentry React Component Error');
  } else {
    setTimeout(() => setCount(count + 1), 0);
  }

  return <div>{count}</div>;
}

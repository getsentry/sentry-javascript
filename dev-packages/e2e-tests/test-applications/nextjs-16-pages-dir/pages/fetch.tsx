import { useEffect } from 'react';

export default function FetchPage() {
  useEffect(() => {
    // test that a span is created in the pageload transaction for this fetch request
    fetch('https://example.com').catch(() => {
      // no-empty
    });
  }, []);

  return <p>Hello world!</p>;
}

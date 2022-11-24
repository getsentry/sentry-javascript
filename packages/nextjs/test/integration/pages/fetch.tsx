import { useEffect } from 'react';

const FetchPage = (): JSX.Element => {
  useEffect(() => {
    // test that a span is created in the pageload transaction for this fetch request
    fetch('http://example.com').catch(() => {
      // no-empty
    });
  }, []);

  return <p>Hello world!</p>;
};

export default FetchPage;

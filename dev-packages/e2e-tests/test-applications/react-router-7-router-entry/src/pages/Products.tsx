import * as React from 'react';

const Products = () => {
  // Fired on mount, i.e. while navigating to /products. This mirrors a typical
  // route component that loads its data in an effect. The request is same-origin,
  // so the SDK attaches `sentry-trace`/`baggage` headers by default.
  React.useEffect(() => {
    fetch('/api/products').catch(() => {
      // ignore network errors in the test environment
    });
  }, []);

  return <div id="products">Products</div>;
};

export default Products;

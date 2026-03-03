import * as React from 'react';
import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <>
      <Link to="/lazy/inner/123/456/789" id="navigation">
        navigate
      </Link>
      <br />
      <Link to="/another-lazy/sub" id="navigation-to-another">
        Navigate to Another Lazy Route
      </Link>
      <br />
      <Link to="/another-lazy/sub/555/666" id="navigation-to-another-deep">
        Navigate to Another Deep Lazy Route
      </Link>
      <br />
      <Link to="/long-running/slow/12345" id="navigation-to-long-running">
        Navigate to Long Running Lazy Route
      </Link>
      <br />
      <Link to="/delayed-lazy/123" id="navigation-to-delayed-lazy">
        Navigate to Delayed Lazy Parameterized Route
      </Link>
      <br />
      <Link to="/delayed-lazy/123?source=homepage" id="navigation-to-delayed-lazy-with-query">
        Navigate to Delayed Lazy with Query Param
      </Link>
      <br />
      <Link to="/deep/level2/level3/123" id="navigation-to-deep">
        Navigate to Deep Nested Route (3 levels, 900ms total)
      </Link>
      <br />
      <Link to="/slow-fetch/123" id="navigation-to-slow-fetch">
        Navigate to Slow Fetch Route (500ms delay with fetch)
      </Link>
      <br />
      <Link to="/wildcard-lazy/789" id="navigation-to-wildcard-lazy">
        Navigate to Wildcard Lazy Route (500ms delay, no fetch)
      </Link>
    </>
  );
};

export default Index;

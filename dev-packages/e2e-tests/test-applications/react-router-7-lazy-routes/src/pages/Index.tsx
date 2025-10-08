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
    </>
  );
};

export default Index;

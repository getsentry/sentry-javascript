import * as React from 'react';
import * as Sentry from '@sentry/react';
import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <>
      <Link to="/user/5" id="navigation">
        navigate
      </Link>
    </>
  );
};

export default Index;

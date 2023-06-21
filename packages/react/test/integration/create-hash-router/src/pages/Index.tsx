import * as Sentry from '@sentry/react';
import * as React from 'react';
import { Link } from 'react-router-dom';

const Index = (): JSX.Element => {
  return (
    <>
      <input
        type="button"
        value="Capture Exception"
        id="exception-button"
        onClick={() => {
          Sentry.captureException(new Error('I am an error!'));
        }}
      />
      <Link to="/user/5" id="navigation">
        navigate
      </Link>
    </>
  );
};

export default Index;

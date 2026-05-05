import * as React from 'react';
import { Link } from 'react-router';

const Index = () => {
  return (
    <>
      <input
        type="button"
        value="Capture Exception"
        id="exception-button"
        onClick={() => {
          throw new Error('I am an error!');
        }}
      />
      <Link to="/user/5" id="navigation">
        navigate
      </Link>
    </>
  );
};

export default Index;

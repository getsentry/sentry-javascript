import * as React from 'react';
import { Link } from 'react-router-dom';

const User = () => {
  return (
    <div>
      <Link to="/" id="home-button">
        Home
      </Link>
      <Link to="/user/5" id="navigation-button">
        navigate
      </Link>
      <p>I am a blank page :)</p>;
    </div>
  );
};

export default User;

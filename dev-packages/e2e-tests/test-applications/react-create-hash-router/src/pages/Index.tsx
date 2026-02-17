import * as React from 'react';
import { Link } from 'react-router-dom';

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
      <Link to="/v2/post/1" id="navigation-post-1">
        Post 1
      </Link>
      <Link to="/v1/post/1/edit" id="navigation-post-1-edit">
        Edit Post 1
      </Link>
      <Link to="/v2/post/1/featured" id="navigation-post-1-featured">
        Post 1 featured
      </Link>
      <Link to="/v2/post/1/related" id="navigation-post-1-related">
        Post 1 related
      </Link>
      <Link to="/group/1" id="navigation-group-1">
        Group 1
      </Link>
      <Link to="/group/1/5" id="navigation-group-1-user-5">
        Group 1 user 5
      </Link>
    </>
  );
};

export default Index;

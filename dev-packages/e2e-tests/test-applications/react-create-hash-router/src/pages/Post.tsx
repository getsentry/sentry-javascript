import * as React from 'react';
import { Outlet } from 'react-router-dom';

const Post = () => {
  return (
    <>
      <p>Post V2 page</p>
      <Outlet />
    </>
  );
};

export default Post;

// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import * as React from 'react';
import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <>
      <Link to="/projects/123/views/456/789" id="navigation">
        navigate
      </Link>
      <Link to="/projects/123/old-views/345/654" id="old-navigation">
        navigate old
      </Link>
    </>
  );
};

export default Index;

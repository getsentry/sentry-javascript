// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import * as React from 'react';
import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <>
      <Link to="/projects/123/views/456" id="navigation">
        navigate
      </Link>
    </>
  );
};

export default Index;

// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import * as React from 'react';

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
    </>
  );
};

export default Index;

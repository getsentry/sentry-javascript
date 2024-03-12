// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import * as React from 'react';

const User = () => {
  return (
    <>
      <p>I am a blank page :)</p>
      <button
        id="userErrorBtn"
        onClick={() => {
          throw new Error('User page error');
        }}
      >
        Throw error
      </button>
    </>
  );
};

export default User;

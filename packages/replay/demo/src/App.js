import React from 'react';
import './App.css';

function App() {
  const [state] = React.useState(99);
  React.useEffect(() => {
    async function test() {
      try {
        await fetch('/testing');
      } catch {}
    }

    test();

    return () => {};
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={`/logo${state}.png`} alt="" />
        <h1>Our cool React app</h1>
      </header>

      <form>
        <div>
          <label>Email:</label>
          <input type="email" name="email" placehodler="email" />
        </div>
        <div>
          <label>Password:</label>
          <input type="password" name="password" placehodler="password" />
        </div>
        <div>
          <label>Secret:</label>
          <input
            type="email"
            name="email"
            placehodler="email"
            className="sr-ignore"
          />
        </div>

        <div className="sr-block">
          <p>Secret Block</p>
        </div>
      </form>

      <button
        onClick={() => {
          throw new Error('Example Error');
        }}
      >
        Break Me
      </button>
    </div>
  );
}

export default App;

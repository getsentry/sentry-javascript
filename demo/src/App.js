import React from 'react';
import './App.css';

function App() {
  const [state, setState] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(async () => {
      try {
      await fetch('/');
      setState(state + 1);
      } catch {}
    }, 5000 + Math.random()*10000);

    return () => clearInterval(id);
  }, [state])

  return (
    <div className='App'>
      <header className='App-header'>
        <img src={ `/logo${state}.png` } />
        <h1>Our cool React app</h1>
      </header>

      <form>
        <div>
          <label>Email:</label>
          <input type='email' name='email' placehodler='email' />
        </div>
        <div>
          <label>Password:</label>
          <input type='password' name='password' placehodler='password' />
        </div>
        <div>
          <label>Secret:</label>
          <input
            type='email'
            name='email'
            placehodler='email'
            className='rr-ignore'
          />
        </div>

        <div className='rr-block'>
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

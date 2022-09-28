import React from 'react';
import logo from './logo.svg';
import * as Sentry from '@sentry/react';
import './App.css';

function App() {
  return (
    <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>}>
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <p>
            Edit <code>src/App.tsx</code> and save to reload.
          </p>
          <a className="App-link" href="https://reactjs.org" target="_blank" rel="noopener noreferrer">
            Learn React
          </a>
        </header>
        <button
          onClick={() => {
            Sentry.captureException(new Error('I am a captured error!'));
          }}
        >
          I am capturing an error
        </button>
      </div>
    </Sentry.ErrorBoundary>
  );
}

export default Sentry.withProfiler(App);

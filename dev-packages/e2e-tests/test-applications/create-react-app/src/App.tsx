import * as Sentry from '@sentry/react';
import React from 'react';
import './App.css';
import logo from './logo.svg';

function App() {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, componentStack, resetError }) => (
        <React.Fragment>
          <div>You have encountered an error</div>
          <div>{`${error}`}</div>
          <div>{componentStack}</div>
          <button
            onClick={() => {
              // When resetError() is called it will remove the Fallback component and render the Sentry ErrorBoundary's
              // children in their initial state
              resetError();
            }}
          >
            Click here to reset!
          </button>
        </React.Fragment>
      )}
    >
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

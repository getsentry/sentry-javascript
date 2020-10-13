import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import * as Sentry from '@sentry/browser';
import SentryRRWeb from '@sentry/rrweb';

Sentry.init({
  dsn:
    'https://375821616abb4d8c94f43726ed08e27f@o19635.ingest.sentry.io/2273529',
  environment: 'demo',
  integrations: [new SentryRRWeb()],
});

ReactDOM.render(<App />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();

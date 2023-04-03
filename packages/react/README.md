<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for ReactJS

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/react/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is a wrapper around `@sentry/browser`, with added functionality related to React. All methods available in
`@sentry/browser` can be imported from `@sentry/react`.

To use this SDK, call `Sentry.init(options)` before you mount your React component.

```javascript
import React from 'react';
import ReactDOM from "react-dom";
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: '__DSN__',
  // ...
});

// ...

ReactDOM.render(<App />, rootNode);

// Can also use with React Concurrent Mode
// ReactDOM.createRoot(rootNode).render(<App />);
```

### ErrorBoundary

`@sentry/react` exports an ErrorBoundary component that will automatically send Javascript errors from inside a
component tree to Sentry, and set a fallback UI. Requires React version >= 16.

> app.js
```javascript
import React from 'react';
import * as Sentry from '@sentry/react';

function FallbackComponent() {
  return (
    <div>An error has occured</div>
  )
}

class App extends React.Component {
  render() {
    return (
      <Sentry.ErrorBoundary fallback={FallbackComponent} showDialog>
        <OtherComponents />
      </Sentry.ErrorBoundary>
    )
  }
}

export default App;
```

### Profiler

`@sentry/react` exports a Profiler component that leverages the tracing features to add React-related
spans to transactions. If tracing is not enabled, the Profiler component will not work. The Profiler
tracks component mount, render duration and updates. Requires React version >= 15.

> app.js
```javascript
import React from 'react';
import * as Sentry from '@sentry/react';

class App extends React.Component {
  render() {
    return (
      <FancyComponent>
        <InsideComponent someProp={2} />
        <AnotherComponent />
      </FancyComponent>
    )
  }
}

export default Sentry.withProfiler(App);
```

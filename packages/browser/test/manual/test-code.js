const Sentry = require('../../dist/index.js');
const Integrations = require('../../../integrations/dist/dedupe.js');

// Init
Sentry.init({
  dsn: 'https://completelyrandom@dsn.asdf/42',
  integrations: [new Integrations.Dedupe()],
  beforeSend(event) {
    console.log('Got an event');
    return null;
  },
  beforeBreadcrumb(crumb) {
    console.log(`Got a breadcrumb: ${crumb.category}`);
    return crumb;
  },
});

// Configure
Sentry.configureScope(scope => {
  scope.setExtra('foo', 'bar');
  scope.setFingerprint('foo');
  scope.setLevel('warning');
  scope.setTag('foo', 'bar');
  scope.setUser('foo', 'bar');
});

// Breadcrumbs integration
window.console.log('Console', 'Breadcrumb');
window.console.error({ foo: 'bar' });

const clickEvent = new MouseEvent('click');
const clickElement = window.document.createElement('button');
clickElement.addEventListener('click', () => {
  // do nothing, just capture a breadcrumb
});
clickElement.dispatchEvent(clickEvent);

const keypressEvent = new KeyboardEvent('keypress');
const keypressElement = window.document.createElement('input');
keypressElement.addEventListener('keypress', () => {
  // do nothing, just capture a breadcrumb
});
keypressElement.dispatchEvent(keypressEvent);

// Basic breadcrumb
Sentry.addBreadcrumb({
  category: 'basic',
  message: 'crumb',
});

// Capture methods
Sentry.captureException(new Error('foo'));
Sentry.captureMessage('bar');

// Scope behavior
Sentry.withScope(scope => {
  scope.setExtra('baz', 'qux');
  scope.setFingerprint('baz');
  scope.setLevel('error');
  scope.setTag('baz', 'qux');
  scope.setUser('baz', 'qux');
  Sentry.captureException(new TypeError('bar'));
  Sentry.captureMessage('baz');
});

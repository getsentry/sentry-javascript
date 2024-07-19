const scope = Sentry.getCurrentScope();
scope.setExtra('foo', 'bar');
scope.setFingerprint('foo');
scope.setLevel('warning');
scope.setTag('foo', 'bar');
scope.setUser('foo', 'bar');

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
Sentry.captureException(new Error('foo'), {
  tags: {
    foo: 1,
  },
});
Sentry.captureException(new Error('foo'), scope => scope);
Sentry.captureMessage('bar');
Sentry.captureMessage('bar', {
  tags: {
    foo: 1,
  },
});
Sentry.captureMessage('bar', scope => scope);

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

var xhr = new XMLHttpRequest();
xhr.onload = () => console.log('loaded'); // This throws error
xhr.open('GET', 'https://httpbin.org/get');
xhr.send();

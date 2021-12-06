import { waitForXHR } from '../../../utils/browserHelpers.ts';

const xhr = new XMLHttpRequest();
xhr.open('GET', '/base/subjects/example.json');
xhr.onreadystatechange = function() {
  window.handlerCalled = true;
};
xhr.send();

waitForXHR(xhr, function() {
  Sentry.captureMessage('test');
});

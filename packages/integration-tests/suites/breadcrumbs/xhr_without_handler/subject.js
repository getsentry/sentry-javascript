import { waitForXHR } from '../../../utils/browserHelpers.ts';

const xhr = new XMLHttpRequest();
xhr.open('GET', '/base/subjects/example.json');
xhr.send();

waitForXHR(xhr, function() {
  Sentry.captureMessage('test');
});

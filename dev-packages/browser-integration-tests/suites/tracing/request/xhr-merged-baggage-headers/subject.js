const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://sentry-test-site.example/1');
xhr.setRequestHeader('X-Test-Header', 'existing-header');
xhr.setRequestHeader('baggage', 'someVendor-foo=bar');

xhr.send();

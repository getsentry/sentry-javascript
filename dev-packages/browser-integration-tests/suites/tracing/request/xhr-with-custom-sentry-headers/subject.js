const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://sentry-test-site.example/1');
xhr.setRequestHeader('X-Test-Header', 'existing-header');
xhr.setRequestHeader('sentry-trace', '123-abc-1');
xhr.setRequestHeader('baggage', 'sentry-release=1.1.1');

xhr.send();

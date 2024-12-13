const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://sentry-test.io/foo', true);
xhr.withCredentials = true;
xhr.setRequestHeader('Accept', 'application/json');
xhr.setRequestHeader('Content-Type', 'application/json');
xhr.setRequestHeader('Cache', 'no-cache');
xhr.send();

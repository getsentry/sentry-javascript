const xhr = new XMLHttpRequest();

xhr.open('POST', 'http://localhost:7654/foo', true);
xhr.setRequestHeader('Accept', 'application/json');
xhr.setRequestHeader('Content-Type', 'application/json');
xhr.setRequestHeader('Cache', 'no-cache');
xhr.send('{"foo":"bar"}');

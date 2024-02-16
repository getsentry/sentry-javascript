const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://localhost:7654/foo', true);
xhr.withCredentials = true;
xhr.setRequestHeader('Accept', 'application/json');
xhr.setRequestHeader('Content-Type', 'application/json');
xhr.setRequestHeader('Cache', 'no-cache');
xhr.send();

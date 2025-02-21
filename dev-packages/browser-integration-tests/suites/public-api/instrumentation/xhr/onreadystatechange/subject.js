window.calls = {};
const xhr = new XMLHttpRequest();
xhr.open('GET', 'http://sentry-test-site.example');
xhr.onreadystatechange = function wat() {
  window.calls[xhr.readyState] = window.calls[xhr.readyState] ? window.calls[xhr.readyState] + 1 : 1;
};
xhr.send();

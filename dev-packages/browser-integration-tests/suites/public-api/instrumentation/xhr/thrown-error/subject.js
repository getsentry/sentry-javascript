const xhr = new XMLHttpRequest();
xhr.open('GET', 'test');
// intentionally assign event handlers *after* open, since this is what jQuery does
xhr.onreadystatechange = function wat() {
  // replace onreadystatechange with no-op so exception doesn't
  // fire more than once as XHR changes loading state
  xhr.onreadystatechange = function () {};
  throw new Error('xhr_error');
};
xhr.send();

// XHR request to a data URL to verify that the span name and attributes are sanitized
const dataUrl = 'data:text/plain;base64,SGVsbG8gV29ybGQh';
const xhr = new XMLHttpRequest();
xhr.open('GET', dataUrl);
xhr.send();

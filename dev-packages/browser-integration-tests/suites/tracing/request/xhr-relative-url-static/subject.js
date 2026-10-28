const xhr_1 = new XMLHttpRequest();
xhr_1.open('GET', '/test-req/0');
xhr_1.send();

const xhr_2 = new XMLHttpRequest();
xhr_2.open('GET', '/test-req/1');
xhr_2.setRequestHeader('X-Test-Header', 'existing-header');
xhr_2.send();

const xhr_3 = new XMLHttpRequest();
xhr_3.open('GET', '/test-req/2');
xhr_3.send();

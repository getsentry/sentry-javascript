const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://sentry-test-site.example/1');
// W3C spec example: property values can contain = signs
// See: https://www.w3.org/TR/baggage/#example
xhr.setRequestHeader('baggage', 'key1=value1;property1;property2,key2=value2,key3=value3; propertyKey=propertyValue');

xhr.send();

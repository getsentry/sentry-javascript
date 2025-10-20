fetchButton.addEventListener('click', () => {
  // W3C spec example: property values can contain = signs
  // See: https://www.w3.org/TR/baggage/#example
  fetch('http://sentry-test-site.example/fetch-test', {
    headers: {
      baggage: 'key1=value1;property1;property2,key2=value2,key3=value3; propertyKey=propertyValue',
    },
  });
});

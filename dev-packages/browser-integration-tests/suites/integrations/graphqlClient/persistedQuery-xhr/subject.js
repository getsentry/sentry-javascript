const xhr = new XMLHttpRequest();

xhr.open('POST', 'http://sentry-test.io/graphql');
xhr.setRequestHeader('Accept', 'application/json');
xhr.setRequestHeader('Content-Type', 'application/json');

const requestBody = JSON.stringify({
  operationName: 'GetUser',
  variables: { id: '123' },
  extensions: {
    persistedQuery: {
      version: 1,
      sha256Hash: 'ecf4edb46db40b5132295c0291d62fb65d6759a9eedfa4d5d612dd5ec54a6b38',
    },
  },
});

xhr.send(requestBody);

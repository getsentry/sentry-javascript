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

fetch('http://sentry-test.io/graphql', {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: requestBody,
});

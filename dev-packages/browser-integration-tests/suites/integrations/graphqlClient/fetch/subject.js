const query = `query Test{
  people {
    name
    pet
  }
}`;

const requestBody = JSON.stringify({ query });

fetch('http://sentry-test.io/foo', {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: requestBody,
});

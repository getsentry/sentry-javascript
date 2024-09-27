const xhr = new XMLHttpRequest();

xhr.open('POST', 'http://sentry-test.io/foo');
xhr.setRequestHeader('Accept', 'application/json');
xhr.setRequestHeader('Content-Type', 'application/json');

const query = `query Test{
  people {
    name
    pet
  }
}`;

const requestBody = JSON.stringify({ query });
xhr.send(requestBody);

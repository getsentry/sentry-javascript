fetch('/test-req/0').then(
  fetch('/test-req/1', { headers: { 'X-Test-Header': 'existing-header' } }).then(fetch('/test-req/2')),
);

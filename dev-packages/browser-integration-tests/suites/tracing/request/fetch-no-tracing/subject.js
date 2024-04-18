fetch('http://example.com/0').then(
  fetch('http://example.com/1', { headers: { 'X-Test-Header': 'existing-header' } }).then(
    fetch('http://example.com/2'),
  ),
);

fetchPojo.addEventListener('click', () => {
  const fetchOptions = {
    headers: {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'sentry-release=4.2.0',
    },
  };

  // Make two fetch requests that reuse the same fetch object
  Sentry.startSpan({ name: 'does-not-matter-1' }, () =>
    fetch('http://example.com/fetch-pojo', fetchOptions)
      .then(res => res.text())
      .then(() =>
        Sentry.startSpan({ name: 'does-not-matter-2' }, () => fetch('http://example.com/fetch-pojo', fetchOptions)),
      ),
  );
});

fetchArray.addEventListener('click', () => {
  const fetchOptions = {
    headers: [
      ['sentry-trace', '12312012123120121231201212312012-1121201211212012-1'],
      ['baggage', 'sentry-release=4.2.0'],
    ],
  };

  // Make two fetch requests that reuse the same fetch object
  Sentry.startSpan({ name: 'does-not-matter-1' }, () =>
    fetch('http://example.com/fetch-array', fetchOptions)
      .then(res => res.text())
      .then(() =>
        Sentry.startSpan({ name: 'does-not-matter-2' }, () => fetch('http://example.com/fetch-array', fetchOptions)),
      ),
  );
});

fetchHeaders.addEventListener('click', () => {
  const fetchOptions = {
    headers: new Headers({
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'sentry-release=4.2.0',
    }),
  };

  // Make two fetch requests that reuse the same fetch object
  Sentry.startSpan({ name: 'does-not-matter-1' }, () =>
    fetch('http://example.com/fetch-headers', fetchOptions)
      .then(res => res.text())
      .then(() =>
        Sentry.startSpan({ name: 'does-not-matter-2' }, () => fetch('http://example.com/fetch-headers', fetchOptions)),
      ),
  );
});

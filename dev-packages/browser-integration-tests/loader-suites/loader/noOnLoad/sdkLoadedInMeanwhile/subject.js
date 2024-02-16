setTimeout(() => {
  const cdnScript = document.createElement('script');
  cdnScript.src = '/cdn.bundle.js';

  cdnScript.addEventListener('load', () => {
    Sentry.init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      replaysSessionSampleRate: 0.42,
    });

    setTimeout(() => {
      window.doSomethingWrong();
    }, 500);
  });

  document.head.appendChild(cdnScript);
}, 100);

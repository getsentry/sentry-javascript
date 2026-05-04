setTimeout(() => {
  const cdnScript = document.createElement('script');
  // Distinct URL from the loader's `/cdn.bundle.js` so Chromium cannot satisfy this via memory-cache
  // (would skip `page.route` and make CDN load counts flaky).
  cdnScript.src = `/cdn.bundle.js?sentryInjected=1`;

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

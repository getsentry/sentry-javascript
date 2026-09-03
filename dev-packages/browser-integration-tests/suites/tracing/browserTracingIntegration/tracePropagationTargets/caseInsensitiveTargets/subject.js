// The request URLs and the configured targets intentionally disagree on casing in both directions.
// These requests never resolve, so each is fired independently rather than chained.
fetch('http://sentry-test-Site.example/string/0').catch(() => {});
fetch('http://sentry-test-site.example/REGEX/1').catch(() => {});
fetch('http://sentry-test-site.example/no-match/2').catch(() => {});

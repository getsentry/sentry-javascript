const input = document.getElementsByTagName('input')[0];
input.addEventListener('build', function (evt) {
  evt.stopPropagation();
});

const customEvent = new CustomEvent('build', { detail: 1 });
input.dispatchEvent(customEvent);

Sentry.captureException('test exception');

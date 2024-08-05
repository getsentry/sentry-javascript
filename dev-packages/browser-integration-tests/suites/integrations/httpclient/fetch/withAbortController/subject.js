let controller;

const startFetch = e => {
  controller = new AbortController();
  const { signal } = controller;

  fetch('http://localhost:7654/foo', { signal })
    .then(response => response.json())
    .then(data => {
      console.log('Fetch succeeded:', data);
    })
    .catch(err => {
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error('Fetch error:', err);
      }
    });
};

const abortFetch = e => {
  if (controller) {
    controller.abort();
  }
};

document.querySelector('[data-test-id=start-button]').addEventListener('click', startFetch);
document.querySelector('[data-test-id=abort-button]').addEventListener('click', abortFetch);

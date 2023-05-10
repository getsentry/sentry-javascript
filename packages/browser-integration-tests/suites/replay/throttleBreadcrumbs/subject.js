window.loaded = [];
const head = document.querySelector('head');

const COUNT = 250;

window.__isLoaded = (run = 1) => {
  return window.loaded.length === COUNT * 2 * run;
};

document.querySelector('[data-network]').addEventListener('click', () => {
  const offset = window.loaded.length;

  // Create many scripts
  for (let i = offset; i < offset + COUNT; i++) {
    const script = document.createElement('script');
    script.src = `/virtual-assets/script-${i}.js`;
    script.setAttribute('crossorigin', 'anonymous');
    head.appendChild(script);

    script.addEventListener('load', () => {
      window.loaded.push(`script-${i}`);
    });
  }
});

document.querySelector('[data-fetch]').addEventListener('click', () => {
  const offset = window.loaded.length;

  // Make many fetch requests
  for (let i = offset; i < offset + COUNT; i++) {
    fetch(`/virtual-assets/fetch-${i}.json`).then(() => {
      window.loaded.push(`fetch-${i}`);
    });
  }
});

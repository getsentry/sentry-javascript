const lazyDiv = document.getElementById('content-lazy');
const navigationButton = document.getElementById('button1');
const navigationDiv = document.getElementById('content-navigation');
const clickButton = document.getElementById('button2');
const clickDiv = document.getElementById('content-click');

navigationButton.addEventListener('click', () => {
  window.history.pushState({}, '', '/some-other-path');
  navigationDiv.innerHTML = `
      <img src="https://sentry-test-site.example/path/to/image-navigation.png" elementtiming="navigation-image" />
      <p elementtiming="navigation-text">This is navigation content</p>
    `;
});

setTimeout(() => {
  lazyDiv.innerHTML = `
      <img src="https://sentry-test-site.example/path/to/image-lazy.png" elementtiming="lazy-image" />
      <p elementtiming="lazy-text">This is lazy loaded content</p>
    `;
}, 1000);

clickButton.addEventListener('click', () => {
  clickDiv.innerHTML = `
      <img src="https://sentry-test-site.example/path/to/image-click.png" elementtiming="click-image" />
      <p elementtiming="click-text">This is click loaded content</p>
    `;
});

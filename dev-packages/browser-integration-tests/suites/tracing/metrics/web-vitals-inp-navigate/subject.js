const simulateNavigationKeepDOM = e => {
  const startTime = Date.now();

  function getElapsed() {
    const time = Date.now();
    return time - startTime;
  }

  while (getElapsed() < 100) {
    // Block UI for 100ms to simulate some processing work during navigation
  }

  const contentDiv = document.getElementById('content');
  contentDiv.innerHTML = '<h1>Page 1</h1><p>Successfully navigated!</p>';

  contentDiv.classList.add('navigated');
};

const simulateNavigationChangeDOM = e => {
  const startTime = Date.now();

  function getElapsed() {
    const time = Date.now();
    return time - startTime;
  }

  while (getElapsed() < 100) {
    // Block UI for 100ms to simulate some processing work during navigation
  }

  const navigationHTML =
    '    <nav id="navigation">\n' +
    '      <a href="#page1" data-test-id="nav-link-keepDOM" data-sentry-element="NavigationLink">Go to Page 1</a>\n' +
    '      <a href="#page2" data-test-id="nav-link-changeDOM" data-sentry-element="NavigationLink">Go to Page 2</a>\n' +
    '    </nav>';

  const body = document.querySelector('body');
  body.innerHTML = `${navigationHTML}<div id="content"><h1>Page 2</h1><p>Successfully navigated!</p></div>`;

  body.classList.add('navigated');
};

document.querySelector('[data-test-id=nav-link-keepDOM]').addEventListener('click', simulateNavigationKeepDOM);
document.querySelector('[data-test-id=nav-link-changeDOM]').addEventListener('click', simulateNavigationChangeDOM);

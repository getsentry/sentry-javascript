// Clicking the navigate button will push a new history state, triggering navigation
document.querySelector('[data-test-id=navigate-button]').addEventListener('click', () => {
  const loc = window.location;
  const url = loc.href.includes('#nav') ? loc.pathname : `${loc.pathname}#nav`;

  history.pushState({}, '', url);
});

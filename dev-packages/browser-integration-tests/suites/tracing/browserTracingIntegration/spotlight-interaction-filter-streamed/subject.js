// Block the main thread for 70ms so the PerformanceObserver registers
// a click event entry, which triggers `ui.interaction.click` child spans.
const simulateSlowClick = e => {
  const startTime = Date.now();
  while (Date.now() - startTime < 70) {
    //
  }
  e.target.classList.add('clicked');
};

document.querySelector('[data-test-id=spotlight-button]').addEventListener('click', simulateSlowClick);
document.querySelector('[data-test-id=regular-button]').addEventListener('click', simulateSlowClick);

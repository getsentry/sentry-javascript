const longTaskButton = document.getElementById('myButton');

longTaskButton?.addEventListener('click', () => {
  const startTime = Date.now();

  function getElapsed() {
    const time = Date.now();
    return time - startTime;
  }

  while (getElapsed() < 500) {
    //
  }

  // trigger a navigation in the same event loop tick
  window.history.pushState({}, '', '#myHeading');
});

(() => {
  const startTime = Date.now();

  function getElapsed() {
    const time = Date.now();
    return time - startTime;
  }

  while (getElapsed() < 101) {
    //
  }
})();

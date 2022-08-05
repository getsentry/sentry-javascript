(() => {
  const startTime = Date.now();

  function getElasped() {
    const time = Date.now();
    return time - startTime;
  }

  console.log('start');
  while (getElasped() < 101) {
    console.log('wait');
  }
  console.log('done');
})();

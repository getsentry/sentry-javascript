const delay = e => {
  const startTime = Date.now();

  function getElasped() {
    const time = Date.now();
    return time - startTime;
  }

  while (getElasped() < 70) {
    //
  }

  e.target.classList.add('clicked');
};

document.querySelector('[data-test-id=interaction-button]').addEventListener('click', delay);

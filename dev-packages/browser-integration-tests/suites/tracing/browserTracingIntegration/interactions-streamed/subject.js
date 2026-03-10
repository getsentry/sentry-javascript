const blockUI = e => {
  const startTime = Date.now();

  function getElapsed() {
    const time = Date.now();
    return time - startTime;
  }

  while (getElapsed() < 70) {
    //
  }

  e.target.classList.add('clicked');
};

document.querySelector('[data-test-id=interaction-button]').addEventListener('click', blockUI);

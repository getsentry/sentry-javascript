const blockUI =
  (delay = 100) =>
  e => {
    const startTime = Date.now();

    function getElapsed() {
      const time = Date.now();
      return time - startTime;
    }

    while (getElapsed() < delay) {
      //
    }

    e.target.classList.add('clicked');
  };

document.querySelector('[data-test-id=inp-button]').addEventListener('click', blockUI(100));

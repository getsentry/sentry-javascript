const blockUI =
  (delay = 70) =>
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

document.querySelector('[data-test-id=slow-button]').addEventListener('click', blockUI(450));
document.querySelector('[data-test-id=normal-button]').addEventListener('click', blockUI());

const blockUI =
  (delay = 70) =>
  e => {
    const startTime = Date.now();

    function getElasped() {
      const time = Date.now();
      return time - startTime;
    }

    while (getElasped() < delay) {
      //
    }

    e.target.classList.add('clicked');
  };

document.querySelector('[data-test-id=not-so-slow-button]').addEventListener('click', blockUI(300));
document.querySelector('[data-test-id=slow-button]').addEventListener('click', blockUI(450));
document.querySelector('[data-test-id=normal-button]').addEventListener('click', blockUI());

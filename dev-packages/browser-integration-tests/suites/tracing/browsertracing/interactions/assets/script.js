const createDelayFunction =
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

document.querySelector('[data-test-id=interaction-button]').addEventListener('click', createDelayFunction());
document.querySelector('[data-test-id=annotated-button]').addEventListener('click', createDelayFunction());
document.querySelector('[data-test-id=slow-interaction-button]').addEventListener('click', createDelayFunction(200));

function getElapsed(startTime) {
  const time = Date.now();
  return time - startTime;
}

function handleClick() {
  const startTime = Date.now();
  while (getElapsed(startTime) < 105) {
    //
  }
  window.history.pushState({}, '', `#myHeading`);
}

const button = document.getElementById('clickme');

console.log('button', button);

button.addEventListener('click', handleClick);

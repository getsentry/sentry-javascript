function getElapsed(startTime) {
  const time = Date.now();
  return time - startTime;
}

function handleClick() {
  const startTime = Date.now();
  while (getElapsed(startTime) < 105) {
    //
  }
}

function start() {
  const startTime = Date.now();
  while (getElapsed(startTime) < 105) {
    //
  }
}

// trigger 2 long-animation-frame events
// one from the top-level and the other from an event-listener
start();

const button = document.getElementById('clickme');
button.addEventListener('click', handleClick);

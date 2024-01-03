// Simple function event listener
const functionListener = () => {
  functionListenerCallback();
};

// Attach event listener twice
window.addEventListener('click', functionListener);
window.addEventListener('click', functionListener);

// Event listener that has handleEvent() method: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#listener
class EventHandlerClass {
  handleEvent() {
    objectListenerCallback();
  }
}

const objectListener = new EventHandlerClass();

// Attach event listener twice
window.addEventListener('click', objectListener);
window.addEventListener('click', objectListener);

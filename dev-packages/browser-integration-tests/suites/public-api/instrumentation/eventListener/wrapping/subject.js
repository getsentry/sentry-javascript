// Simple function event listener
const functionListener = () => {
  reportFunctionListenerStackHeight(new Error().stack.split('\n').length);
};

// Event listener that has handleEvent() method: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#listener
class EventHandlerClass {
  handleEvent() {
    reportObjectListenerStackHeight(new Error().stack.split('\n').length);
  }
}

const objectListener = new EventHandlerClass();

window.attachListeners = function () {
  window.addEventListener('click', functionListener);
  window.addEventListener('click', objectListener);
};

// Simple function event listener
const eventListener1 = () => {
  testCallback1();
};

// Attach event listener twice
window.addEventListener('click', eventListener1);
window.addEventListener('click', eventListener1);

// Event listener that has handleEvent() method: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#listener
class EventHandlerClass {
  handleEvent() {
    testCallback2();
  }
}

const eventListener2 = new EventHandlerClass();

// Attach event listener twice
window.addEventListener('click', eventListener2);
window.addEventListener('click', eventListener2);

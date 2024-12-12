const btn = document.createElement('button');
btn.id = 'btn';
document.body.appendChild(btn);

const functionListener = function () {
  functionCallback(this.constructor.name);
};

class EventHandlerClass {
  handleEvent() {
    classInstanceCallback(this.constructor.name);
  }
}
const objectListener = new EventHandlerClass();

// Attach event listeners a few times for good measure

btn.addEventListener('click', functionListener);
btn.addEventListener('click', functionListener);
btn.addEventListener('click', functionListener);

btn.addEventListener('click', objectListener);
btn.addEventListener('click', objectListener);
btn.addEventListener('click', objectListener);

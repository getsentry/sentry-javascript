function moveElement(el, remaining) {
  if (!remaining) {
    el.classList.remove('moving');

    setTimeout(() => {
      el.style.transform = `translate(${remaining}0px, 0)`;
      el.classList.add('moved');
    });
    return;
  }

  el.style.transform = `translate(${remaining}0px, 0)`;

  setTimeout(() => {
    moveElement(el, remaining - 1);
  }, 10);
}

const el = document.querySelector('#mutation-target');
const btn = document.querySelector('#button-move');

btn.addEventListener('click', event => {
  el.classList.add('moving');
  event.preventDefault();
  moveElement(el, 20);
});

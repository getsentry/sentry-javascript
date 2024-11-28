const btn = document.createElement('button');
btn.id = 'btn';
document.body.appendChild(btn);

const functionListener = function () {
  throw new Error('event_listener_error');
};

btn.addEventListener('click', functionListener);

btn.click();

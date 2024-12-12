function clickHandler() {
  throw new Error('event_listener_error');
}

window.addEventListener('click', clickHandler);

document.body.click();

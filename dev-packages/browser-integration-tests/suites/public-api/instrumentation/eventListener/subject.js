window.addEventListener('click', () => {
  throw new Error('event_listener_error');
});

document.body.click();

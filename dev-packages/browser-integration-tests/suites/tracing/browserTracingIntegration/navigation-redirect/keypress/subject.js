document.getElementById('btn1').addEventListener('click', () => {
  // trigger redirect immediately
  window.history.pushState({}, '', '/sub-page');
});

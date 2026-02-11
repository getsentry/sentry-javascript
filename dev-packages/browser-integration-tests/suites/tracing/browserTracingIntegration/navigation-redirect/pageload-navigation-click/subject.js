document.getElementById('btn1').addEventListener('click', () => {
  // trigger redirect immediately
  window.history.pushState({}, '', '/sub-page');
});

// Now trigger click, which should trigger navigation
document.getElementById('btn1').click();

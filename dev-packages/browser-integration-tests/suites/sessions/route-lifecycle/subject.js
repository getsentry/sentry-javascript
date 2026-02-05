let clickCount = 0;

document.getElementById('navigate').addEventListener('click', () => {
  clickCount++;
  history.pushState({}, '', `/page-${clickCount}`);
});

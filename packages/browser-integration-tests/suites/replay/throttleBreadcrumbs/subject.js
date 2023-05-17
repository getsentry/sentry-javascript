const COUNT = 400;

document.querySelector('[data-console]').addEventListener('click', () => {
  // Call console.log() many times
  for (let i = 0; i < COUNT; i++) {
    console.log(`testing ${i}`);
  }
});

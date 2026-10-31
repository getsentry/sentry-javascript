// SOURCEMAP_MARKER_CLIENT
document.querySelector('button')?.addEventListener('click', () => {
  throw new Error('Client error');
});

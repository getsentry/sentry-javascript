document.getElementById('thirdPartyErrBtn').addEventListener('click', () => {
  throw new Error('I am a third party Error');
});

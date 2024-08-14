document.addEventListener('securitypolicyviolation', () => {
  const container = document.querySelector('#csp-violation');
  if (container) {
    container.innerText = 'CSP Violation';
  }
});

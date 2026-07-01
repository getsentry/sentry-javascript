document.getElementById('set-user').addEventListener('click', () => {
  Sentry.setUser({
    id: '1337',
    email: 'user@name.com',
    username: 'user1337',
  });
});

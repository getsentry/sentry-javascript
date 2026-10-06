export const load = async ({ fetch }) => {
  const res = await fetch('/wrap-server-route/api');
  const myMessage = await res.json();
  return {
    myMessage: myMessage.myMessage,
  };
};

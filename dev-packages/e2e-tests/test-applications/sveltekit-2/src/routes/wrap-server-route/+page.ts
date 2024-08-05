export const load = async ({ fetch }) => {
  const res = await fetch('/wrap-server-route/api');
  const myMessage = await res.json();
  console.log({ myMessage });
  return {
    myMessage: myMessage.myMessage,
  };
};

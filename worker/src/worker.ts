import * as pako from 'pako';

onmessage = function (e) {
  console.log('Message received from main script');
  const input = new Uint8Array();
  const output = pako.deflate(input);
  console.log('Posting message back to main script');
  postMessage(output);
};

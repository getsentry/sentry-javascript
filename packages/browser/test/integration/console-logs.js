console.log('One');
console.warn('Two', { a: 1 });
console.error('Error 2', { b: { c: 1 } });
function a() {
  throw new Error('Error thrown 3');
}
a();

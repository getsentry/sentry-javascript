console.log('One');
console.log('Two', { a: 1 });
console.error('Error 2');
let a = () => {
  throw new Error('Error thrown 3');
};
a();

const div = document.createElement('div');
document.body.appendChild(div);
const fooFn = function () {
  throw new Error('foo');
};
const barFn = function () {
  throw new Error('bar');
};
div.addEventListener('click', fooFn);
div.addEventListener('click', barFn);
div.removeEventListener('click', barFn);
div.dispatchEvent(new MouseEvent('click'));

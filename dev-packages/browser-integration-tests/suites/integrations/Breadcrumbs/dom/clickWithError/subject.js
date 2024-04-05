const click = new MouseEvent('click');
function kaboom() {
  throw new Error('lol');
}
Object.defineProperty(click, 'target', { get: kaboom });
const input = document.getElementById('input1');
input.dispatchEvent(click);

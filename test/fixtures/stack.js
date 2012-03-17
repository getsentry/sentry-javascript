function foo() {
  bar('hey');
}

function bar(a,b,c) {
  var test='yay!';
  trace();
}

function trace() {
  console.log(__stack[1].fun.arguments);
}

foo();

module.exports = function () {
  var w = "this is a really long line to make sure that we will truncate it and not send the entire massive line to the server because we don't want to do that, we want to send just the beginning not the whole thing";
  var x = "this is a really long line but not as long as the last one"; throw new Error('boom'); var y = "we will continue here to make sure we grab the middle of this line and don't just grab the beginning or end";
  var z = "this is a really long line to make sure that we will truncate it and not send the entire massive line to the server because we don't want to do that, we want to send just the beginning not the whole thing";
};

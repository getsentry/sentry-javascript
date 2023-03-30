// Sentry ES5 polyfills
if (!('includes' in Array.prototype)) {
  Array.prototype.includes = function (searchElement) {
    return this.indexOf(searchElement) > -1;
  };
}
if (!('find' in Array.prototype)) {
  Array.prototype.find = function (callback) {
    for (var i = 0; i < this.length; i++) {
      if (callback(this[i])) {
        return this[i];
      }
    }
  };
}
if (!('findIndex' in Array.prototype)) {
  Array.prototype.findIndex = function (callback) {
    for (var i = 0; i < this.length; i++) {
      if (callback(this[i])) {
        return i;
      }
    }
    return -1;
  };
}
if (!('includes' in String.prototype)) {
  String.prototype.includes = function (searchElement) {
    return this.indexOf(searchElement) > -1;
  };
}
if (!('startsWith' in String.prototype)) {
  String.prototype.startsWith = function (searchElement) {
    return this.indexOf(searchElement) === 0;
  };
}
if (!('endsWith' in String.prototype)) {
  String.prototype.endsWith = function (searchElement) {
    var i = this.indexOf(searchElement);
    return i > -1 && i === this.length - searchElement.length;
  };
}

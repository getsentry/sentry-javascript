function throwObjectError() {
  // never do this; just making sure Raven.js handles this case
  // gracefully
  throw { error: "stuff is broken", somekey: "ok" };
}

throwObjectError();

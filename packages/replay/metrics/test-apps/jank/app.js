/* Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

(function(window) {
  'use strict';

  var app = {},
      proto = document.querySelector('.proto'),
      movers,
      bodySize = document.body.getBoundingClientRect(),
      ballSize = proto.getBoundingClientRect(),
      maxHeight = Math.floor(bodySize.height - ballSize.height),
      maxWidth = 97, // 100vw - width of square (3vw)
      incrementor = 10,
      distance = 3,
      frame,
      minimum = 10,
      subtract = document.querySelector('.subtract'),
      add = document.querySelector('.add');

  app.optimize = false;
  app.count = minimum;
  app.enableApp = true;

  app.init = function () {
    if (movers) {
      bodySize = document.body.getBoundingClientRect();
      for (var i = 0; i < movers.length; i++) {
        document.body.removeChild(movers[i]);
      }
      document.body.appendChild(proto);
      ballSize = proto.getBoundingClientRect();
      document.body.removeChild(proto);
      maxHeight = Math.floor(bodySize.height - ballSize.height);
    }
    for (var i = 0; i < app.count; i++) {
      var m = proto.cloneNode();
      var top = Math.floor(Math.random() * (maxHeight));
      if (top === maxHeight) {
        m.classList.add('up');
      } else {
        m.classList.add('down');
      }
      m.style.left = (i / (app.count / maxWidth)) + 'vw';
      m.style.top = top + 'px';
      document.body.appendChild(m);
    }
    movers = document.querySelectorAll('.mover');
  };

  app.update = function (timestamp) {
    for (var i = 0; i < app.count; i++) {
      var m = movers[i];
      if (!app.optimize) {
        var pos = m.classList.contains('down') ?
            m.offsetTop + distance : m.offsetTop - distance;
        if (pos < 0) pos = 0;
        if (pos > maxHeight) pos = maxHeight;
        m.style.top = pos + 'px';
        if (m.offsetTop === 0) {
          m.classList.remove('up');
          m.classList.add('down');
        }
        if (m.offsetTop === maxHeight) {
          m.classList.remove('down');
          m.classList.add('up');
        }
      } else {
        var pos = parseInt(m.style.top.slice(0, m.style.top.indexOf('px')));
        m.classList.contains('down') ? pos += distance : pos -= distance;
        if (pos < 0) pos = 0;
        if (pos > maxHeight) pos = maxHeight;
        m.style.top = pos + 'px';
        if (pos === 0) {
          m.classList.remove('up');
          m.classList.add('down');
        }
        if (pos === maxHeight) {
          m.classList.remove('down');
          m.classList.add('up');
        }
      }
    }
    frame = window.requestAnimationFrame(app.update);
  }

  document.querySelector('.stop').addEventListener('click', function (e) {
    if (app.enableApp) {
      cancelAnimationFrame(frame);
      e.target.textContent = 'Start';
      app.enableApp = false;
    } else {
      frame = window.requestAnimationFrame(app.update);
      e.target.textContent = 'Stop';
      app.enableApp = true;
    }
  });

  document.querySelector('.optimize').addEventListener('click', function (e) {
    if (e.target.textContent === 'Optimize') {
      app.optimize = true;
      e.target.textContent = 'Un-Optimize';
    } else {
      app.optimize = false;
      e.target.textContent = 'Optimize';
    }
  });

  add.addEventListener('click', function (e) {
    cancelAnimationFrame(frame);
    app.count += incrementor;
    subtract.disabled = false;
    app.init();
    frame = requestAnimationFrame(app.update);
  });

  subtract.addEventListener('click', function () {
    cancelAnimationFrame(frame);
    app.count -= incrementor;
    app.init();
    frame = requestAnimationFrame(app.update);
    if (app.count === minimum) {
      subtract.disabled = true;
    }
  });

  function debounce(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };

  var onResize = debounce(function () {
    if (app.enableApp) {
        cancelAnimationFrame(frame);
        app.init();
        frame = requestAnimationFrame(app.update);
    }
  }, 500);

  window.addEventListener('resize', onResize);

  add.textContent = 'Add ' + incrementor;
  subtract.textContent = 'Subtract ' + incrementor;
  document.body.removeChild(proto);
  proto.classList.remove('.proto');
  app.init();
  window.app = app;
  frame = window.requestAnimationFrame(app.update);

})(window);

// Vendored from https://github.com/eyworldwide/typedoc-plugin-remove-references/blob/f9e5e264a1eb75567e763d7a0bb270046f5e9329/

// MIT License

// Copyright (c) 2020 Bob

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const { ReflectionKind, Converter } = require('typedoc');

function load({ application }) {
  application.converter.on(Converter.EVENT_RESOLVE_BEGIN, context => {
    for (const reflection of context.project.getReflectionsByKind(ReflectionKind.Reference)) {
      context.project.removeReflection(reflection);
    }
  });
}

module.exports = { load };

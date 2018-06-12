Mocha = require('mocha')
should = require('should')

fs = require('fs')
path = require('path')

mocha = new Mocha

['test', 'test/vendor'].forEach (dir) ->
  fs.readdirSync(dir).filter (file) ->
      file.substr(-3) == '.js';
  .forEach (file) ->
      mocha.addFile path.join(dir, file)

mocha.run (failures) ->
    process.on 'exit', () ->
        process.exit(failures);

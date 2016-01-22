Mocha = require('mocha')
should = require('should')

fs = require('fs')
path = require('path')

mocha = new Mocha

fs.readdirSync('test').filter (file) ->
    return file.substr(-3) == '.js';
.forEach (file) ->
    mocha.addFile path.join('test', file)

mocha.run (failures) ->
    process.on 'exit', () ->
        process.exit(failures);

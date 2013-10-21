module.exports = function(grunt) {
    "use strict";

    var _ = grunt.util._;
    var path = require('path');

    var coreFiles = [
        'vendor/**/*.js',
        'template/_header.js',
        'src/**/*.js',
        'template/_footer.js'
    ];

    var plugins = grunt.option('plugins');
    // Create plugin paths and verify hey exist
    plugins = _.map(plugins ? plugins.split(',') : [], function (plugin) {
        var path = 'plugins/' + plugin + '.js';

        if(!grunt.file.exists(path))
            throw new Error("Plugin '" + plugin + "' not found in plugins directory.");

        return path;
    });

    // Taken from http://dzone.com/snippets/calculate-all-combinations
    var combine = function (a) {
        var fn = function (n, src, got, all) {
            if (n === 0) {
                all.push(got);
                return;
            }

            for (var j = 0; j < src.length; j++) {
                fn(n - 1, src.slice(j + 1), got.concat([src[j]]), all);
            }
        };

        var all = [a];

        for (var i = 0; i < a.length; i++) {
            fn(i, a, [], all);
        }

        return all;
    };

    var pluginCombinations = combine(grunt.file.expand('plugins/*.js'));
    var pluginConcatFiles = _.reduce(pluginCombinations, function (dict, comb) {
        var key = _.map(comb, function (plugin) {
            return path.basename(plugin, '.js');
        });
        key.sort();

        var dest = path.join('build/', key.join(','), '/<%= pkg.name %>.js');
        dict[dest] = coreFiles.concat(comb);

        return dict;
    }, {});

    var gruntConfig = {
        pkg: grunt.file.readJSON('package.json'),
        clean: ['build'],
        concat: {
            options: {
                separator: '\n',
                banner: grunt.file.read('template/_copyright.js'),
                process: true
            },
            core: {
                src: coreFiles.concat(plugins),
                dest: 'build/<%= pkg.name %>.js'
            },
            all: {
                files: pluginConcatFiles
            }
        },

        uglify: {
            options: {
                banner: grunt.file.read('template/_copyright.min.js'),
                sourceMap: function (dest) {
                    return path.join(path.dirname(dest),
                                     path.basename(dest, '.js')) +
                           '.map';
                }
            },
            dist: {
                src: ['build/**/*.js'],
                ext: '.min.js',
                expand: true
            }
        },

        jshint: {
            options: {
                jshintrc: '.jshintrc'
            },
            all: ['Gruntfile.js', 'src/**/*.js', 'plugins/**/*.js']
        },

        mocha: {
            all: {
                options: {
                    mocha: {
                        ignoreLeaks: true,
                        grep:        grunt.option('grep')
                    },
                    log:      true,
                    reporter: 'Dot',
                    run:      true
                },
                src: ['test/index.html'],
                nonull: true
            }
        },

        release: {
            options: {
                npm:           false,
                commitMessage: 'Release <%= version %>'
            }
        }
    };

    grunt.initConfig(gruntConfig);

    // Grunt contrib tasks
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-jshint');

    // 3rd party Grunt tasks
    grunt.loadNpmTasks('grunt-mocha');
    grunt.loadNpmTasks('grunt-release');

    // Build tasks
    grunt.registerTask('build.core', ['clean', 'concat:core', 'uglify']);
    grunt.registerTask('build.all', ['clean', 'concat:all', 'uglify']);

    // Test task
    grunt.registerTask('test', ['jshint', 'mocha']);

    grunt.registerTask('default', ['build.all']);
};

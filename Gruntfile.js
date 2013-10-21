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
        aws: grunt.file.exists('aws.json') ? grunt.file.readJSON('aws.json'): {},

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
                sourceMap: function (dest) {
                    return path.join(path.dirname(dest),
                                     path.basename(dest, '.js')) +
                           '.map';
                },
                sourceMappingURL: function (dest) {
                    return path.basename(dest, '.js') + '.map';
                },
                preserveComments: 'some'
            },
            dist: {
                src: ['build/**/*.js'],
                ext: '.min.js',
                expand: true
            }
        },

        fixSourceMaps: {
            options: {
                srcBase: 'build',
                destBase: 'build'
            },
            all: ['build/**/*.map']
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
        },

        s3: {
            options: {
                key: '<%= aws.key %>',
                secret: '<%= aws.secret %>',
                bucket: '<%= aws.bucket %>',
                access: 'public-read'
            },
            all: {
                upload: [{
                    src: 'build/**/*',
                    dest: 'build/<%= pkg.version %>/',
                    rel: 'build/'
                }]
            }
        }
    };

    grunt.initConfig(gruntConfig);

    // Custom Grunt tasks
    grunt.registerMultiTask('fixSourceMaps', function () {
        var options = this.options({
            destBase: '',
            srcBase: ''
        });

        this.files.forEach(function (f) {
            var result;
            var sources = f.src.filter(function (filepath) {
                if (!grunt.file.exists(filepath)) {
                    grunt.log.warn('Source file "' + filepath + '" not found.');
                    return false;
                } else {
                    return true;
                }
            }).forEach(function (filepath) {
                var sMap = grunt.file.readJSON(filepath);
                sMap.file = path.relative(options.destBase, sMap.file);
                sMap.sources = _.map(sMap.sources, path.relative.bind(path, options.srcBase));

                grunt.file.write(filepath, JSON.stringify(sMap));
                // Print a success message.
                grunt.log.writeln('File "' + filepath + '" fixed.');
            });
        });
    });

    // Grunt contrib tasks
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-jshint');

    // 3rd party Grunt tasks
    grunt.loadNpmTasks('grunt-mocha');
    grunt.loadNpmTasks('grunt-release');
    grunt.loadNpmTasks('grunt-s3');

    // Build tasks
    grunt.registerTask('build.core', ['clean', 'concat:core', 'uglify', 'fixSourceMaps']);
    grunt.registerTask('build.all', ['clean', 'concat:all', 'uglify', 'fixSourceMaps']);

    // Test task
    grunt.registerTask('test', ['jshint', 'mocha']);

    grunt.registerTask('publish', ['test', 'build.all', 's3']);
    grunt.registerTask('default', ['build.all']);
};

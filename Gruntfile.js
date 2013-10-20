module.exports = function(grunt) {
    var _ = grunt.util._;

    var plugins = (grunt.option('plugins') || '').split(',');

    var gruntConfig = {
        pkg: grunt.file.readJSON('package.json'),
        concat: {
            options: {
                separator: '\n'
            },
            dist: {
                src: [
                    'vendor/**/*.js',
                    'template/_header.js',
                    'src/**/*.js',
                    'template/_footer.js'
                ],
                dest: 'build/<%= pkg.name %>.js'
            }
        },
        uglify: {
            options: {
                banner: '/*! Raven.js <%= pkg.version %> | github.com/getsentry/raven-js */\n'
            },
            dist: {
                files: {
                    'build/<%= pkg.name %>.min.js': ['<%= concat.dist.dest %>']
                }
            }
        }
    };

    // Create plugin paths and verify hey exist
    var plugins = _.map(plugins, function (plugin) {
        var path = 'plugins/' + plugin + '.js';

        if(!grunt.file.exists(path))
            throw new Error("Plugin '" + plugin + "' not found in plugins directory.");

        return path;
    });

    // Amend plugins to the concat source list
    gruntConfig.concat.dist.src = gruntConfig.concat.dist.src.concat(plugins);

    grunt.initConfig(gruntConfig);

    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-concat');

    grunt.registerTask('default', ['concat', 'uglify']);

};

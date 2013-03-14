import datetime

from invoke.tasks import task
from invoke.runner import run

VERSION = open('version.txt').read().strip()

BASE_S3_ARGS = ['--acl-public']
JS_S3_ARGS = ['--guess-mime-type', '--add-header "Content-Encoding: gzip"']

SHORT_FUTURE = datetime.timedelta(hours=1)
MEDIUM_FUTURE = datetime.timedelta(days=1)
FAR_FUTURE = datetime.timedelta(days=365)


@task
def test():
    run('node_modules/.bin/jshint .')
    run('node_modules/.bin/mocha-phantomjs -R dot test/index.html')


@task('test')
def build():
    "Publish a nightly build"
    make(get_rev())


@task('test')
def release():
    "Publish a tagged version"
    make(VERSION)
    tag(VERSION)


def make(version):
    run('VERSION=%s make raven' % version)
    for raven in ('raven.js', 'raven.min.js'):
        gzip(raven)
        publish(raven, version, BASE_S3_ARGS + JS_S3_ARGS)
    publish('raven.min.map', version, BASE_S3_ARGS)


def gzip(path):
    run('gzip -6 build/%s' % path)
    run('mv build/%s.gz build/%s' % (path, path))


def publish(path, version, args):
    if '.' in version:
        package = 'dist'
        cache = get_cache_headers(FAR_FUTURE)
        branch = version
    else:
        package = 'build'
        cache = get_cache_headers(SHORT_FUTURE)
        branch = get_branch()

    upload(path, args + cache, package, branch)

    if package == 'dist':
        run('mkdir -p dist/%s' % version)
        run('cp build/%s dist/%s' % (path, version))
        version = version.split('.')
        version.pop()
        cache = get_cache_headers(MEDIUM_FUTURE)
        while version:
            upload(path, args + cache, package, '.'.join(version))
            version.pop()

def tag(version):
    run('git add dist/%s' % version)
    run('git commit -m "%s"' % version)
    run('git tag %s' % version)
    run('git push origin %s' % version)


def upload(path, args, package, build):
    run('s3cmd put %s build/%s s3://getsentry-cdn/%s/%s/%s' %
        (' '.join(args), path, package, build, path))


def get_cache_headers(delta):
    expires = datetime.datetime.utcnow() + delta
    return ['--add-header "Cache-Control: public, max-age=%d"' % delta.total_seconds(),
            '--add-header "Expires: %s GMT"' % expires.strftime('%a, %d %h %Y %T')]


def get_branch():
    return run('git rev-parse --short --abbrev-ref HEAD', hide='both').stdout.strip()


def get_rev():
    return run('git rev-parse --short HEAD', hide='both').stdout.strip()

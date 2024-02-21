#!/bin/sh

gc() {
  sleep 2
  curl localhost:3000/gc
}

gc_restart() {
  gc
  sleep 2
  curl localhost:3000/shutdown
  sleep 2
}

curl localhost:3000/capture
gc
gc
curl localhost:3000/capture
gc
gc_restart

curl localhost:3000/capture_large_source
gc
gc
gc_restart

ab -c 5 -n 5000 localhost:3000/hello
gc_restart

ab -c 5 -n 5000 localhost:3000/context/basic
gc_restart

ab -c 5 -n 5000 localhost:3000/breadcrumbs/capture
gc_restart

ab -c 5 -n 5000 localhost:3000/breadcrumbs/auto/console
gc_restart

ab -c 5 -n 5000 localhost:3000/breadcrumbs/auto/http
gc_restart


ab -c 5 -n 2000 localhost:3000/hello?doError=true
gc_restart

ab -c 5 -n 2000 localhost:3000/context/basic?doError=true
gc_restart

ab -c 5 -n 2000 localhost:3000/breadcrumbs/capture?doError=true
gc_restart

ab -c 5 -n 2000 localhost:3000/breadcrumbs/auto/console?doError=true
gc_restart

ab -c 5 -n 2000 localhost:3000/breadcrumbs/auto/http?doError=true
gc_restart

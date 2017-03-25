#!/bin/sh
gc_restart() {
  sleep 1
  curl localhost:3000/gc
  sleep 1
  curl localhost:3000/shutdown
  sleep 1
}

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


ab -c 5 -n 5000 localhost:3000/hello?doError=true
gc_restart

ab -c 5 -n 5000 localhost:3000/context/basic?doError=true
gc_restart

ab -c 5 -n 5000 localhost:3000/breadcrumbs/capture?doError=true
gc_restart

ab -c 5 -n 5000 localhost:3000/breadcrumbs/auto/console?doError=true
gc_restart

ab -c 5 -n 5000 localhost:3000/breadcrumbs/auto/http?doError=true
gc_restart

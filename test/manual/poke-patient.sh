#!/bin/sh
ab -c 5 -n 10000 localhost:3000/hello
curl localhost:3000/gc
ab -c 5 -n 10000 localhost:3000/context/basic
curl localhost:3000/gc
ab -c 5 -n 10000 localhost:3000/breadcrumbs/capture
curl localhost:3000/gc
ab -c 5 -n 10000 localhost:3000/breadcrumbs/auto/console
curl localhost:3000/gc
ab -c 5 -n 10000 localhost:3000/breadcrumbs/auto/http
curl localhost:3000/gc

ab -c 5 -n 10000 localhost:3000/hello?doError=true
curl localhost:3000/gc
ab -c 5 -n 10000 localhost:3000/context/basic?doError=true
curl localhost:3000/gc
ab -c 5 -n 10000 localhost:3000/breadcrumbs/capture?doError=true
curl localhost:3000/gc
ab -c 5 -n 10000 localhost:3000/breadcrumbs/auto/console?doError=true
curl localhost:3000/gc
ab -c 5 -n 10000 localhost:3000/breadcrumbs/auto/http?doError=true
curl localhost:3000/gc

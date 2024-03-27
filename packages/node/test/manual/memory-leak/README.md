# Manual Tests

## How this works

`express-patient.js` is an express app with a collection of endpoints that exercise various functionalities of
@sentry/node, including exception capturing, contexts, autobreadcrumbs, and the express middleware.

It uses [memwatch-next](https://www.npmjs.com/package/memwatch-next) to record memory usage after each GC. `manager.js`
does some child process stuff to have a fresh patient process for each test scenario, while poke-patient.sh uses apache
bench to send a bunch of traffic so we can see what happens.

## Routes and what we test

The @sentry/node express middleware is used on all endpoints, so each request constitutes its own context.

- `/hello`: just send a basic response without doing anything
- `/context/basic`: `setContext` call
- `/breadcrumbs/capture`: manual `captureBreadcrumb` call
- `/breadcrumbs/auto/console`: console log with console autoBreadcrumbs enabled
- `/breadcrumbs/auto/http`: send an http request with http autoBreadcrumbs enabled
  - uses nock to mock the response, not actual request
- If the request has querystring param `doError=true`, we pass an error via Express's error handling mechanism with
  `next(new Error(responseText))` which will then be captured by the @sentry/node express middleware error handler.
  - We test all 5 above cases with and without `doError=true`

We also have a `/gc` endpoint for forcing a garbage collection; this is used at the end of each test scenario to see
final memory usage.

Note: there's a `/capture` endpoint which does a basic `captureException` call 1000 times. That's our current problem
child requiring some more investigation on its memory usage.

## How to run it

```bash
npm install memwatch-next nock
node manager.js
# in another tab send some traffic at it:
curl localhost:3000/capture
```

## Why this can't be more automated

Some objects can have long lifecycles or not be cleaned up by GC when you think they would be, and so it isn't
straightforward to make the assertion "memory usage should have returned to baseline by now". Also, when the numbers
look bad, it's pretty obvious to a trained eye that they're bad, but it can be hard to quantify an exact threshold of
pass or fail.

## Interpreting results

Starting the manager and then running `ab -c 5 -n 5000 /context/basic && sleep 1 && curl localhost:3000/gc` will get us
this output:

<details>
```
:[/Users/lewis/dev/raven-node/test/manual]#memleak-tests?$ node manager.js
starting child
patient is waiting to be poked on port 3000
gc #1: min 0, max 0, est base 11639328, curr base 11639328
gc #2: min 0, max 0, est base 11582672, curr base 11582672
hit /context/basic for first time
gc #3: min 16864536, max 16864536, est base 16864536, curr base 16864536
gc #4: min 14830680, max 16864536, est base 14830680, curr base 14830680
gc #5: min 14830680, max 16864536, est base 16013904, curr base 16013904
hit /gc for first time
gc #6: min 12115288, max 16864536, est base 12115288, curr base 12115288
gc #7: min 11673824, max 16864536, est base 11673824, curr base 11673824
```
</details>
This test stores some basic data in the request's Raven context, with the hope being for that context data to go out of scope and be garbage collected after the request is over. We can see that we start at a base of ~11.6MB, go up to ~16.8MB during the test, and then return to ~11.6MB. Everything checks out, no memory leak issue here.

Back when we had a memory leak in `captureException`, if we started the manager and ran:

```shell
ab -c 5 -n 5000 localhost:3000/context/basic?doError=true && sleep 5 && curl localhost:3000/gc
sleep 5
curl localhost:3000/gc
sleep 10
curl localhost:3000/gc
sleep 15
curl localhost:3000/gc
```

we'd get this output:

<details>
```
[/Users/lewis/dev/raven-node/test/manual]#memleak-tests?$ node manager.js
starting child
patient is waiting to be poked on port 3000
gc #1: min 0, max 0, est base 11657056, curr base 11657056
gc #2: min 0, max 0, est base 11599392, curr base 11599392
hit /context/basic?doError=true for first time
gc #3: min 20607752, max 20607752, est base 20607752, curr base 20607752
gc #4: min 20607752, max 20969872, est base 20969872, curr base 20969872
gc #5: min 19217632, max 20969872, est base 19217632, curr base 19217632
gc #6: min 19217632, max 21025056, est base 21025056, curr base 21025056
gc #7: min 19217632, max 21096656, est base 21096656, curr base 21096656
gc #8: min 19085432, max 21096656, est base 19085432, curr base 19085432
gc #9: min 19085432, max 22666768, est base 22666768, curr base 22666768
gc #10: min 19085432, max 22666768, est base 22487320, curr base 20872288
gc #11: min 19085432, max 22708656, est base 22509453, curr base 22708656
gc #12: min 19085432, max 22708656, est base 22470302, curr base 22117952
gc #13: min 19085432, max 22708656, est base 22440838, curr base 22175664
gc #14: min 19085432, max 22829952, est base 22479749, curr base 22829952
gc #15: min 19085432, max 25273504, est base 22759124, curr base 25273504
gc #16: min 19085432, max 25273504, est base 22707814, curr base 22246024
gc #17: min 19085432, max 33286216, est base 23765654, curr base 33286216
gc #18: min 19085432, max 33286216, est base 23863713, curr base 24746248
gc #19: min 19085432, max 33286216, est base 23685980, curr base 22086392
gc #20: min 19085432, max 33286216, est base 23705022, curr base 23876400
gc #21: min 19085432, max 33286216, est base 23769947, curr base 24354272
gc #22: min 19085432, max 33286216, est base 23987724, curr base 25947720
gc #23: min 19085432, max 33286216, est base 24636946, curr base 30479952
gc #24: min 19085432, max 33286216, est base 24668561, curr base 24953096
gc #25: min 19085432, max 33286216, est base 24750980, curr base 25492760
gc #26: min 19085432, max 33286216, est base 24956242, curr base 26803600
gc #27: min 19085432, max 33286216, est base 25127122, curr base 26665048
gc #28: min 19085432, max 33286216, est base 25357309, curr base 27428992
gc #29: min 19085432, max 33286216, est base 25519102, curr base 26975240
gc #30: min 19085432, max 33286216, est base 25830428, curr base 28632368
gc #31: min 19085432, max 33286216, est base 26113116, curr base 28657312
gc #32: min 19085432, max 33286216, est base 26474999, curr base 29731952
gc #33: min 19085432, max 41429616, est base 27970460, curr base 41429616
gc #34: min 19085432, max 41429616, est base 29262386, curr base 40889728
gc #35: min 19085432, max 41429616, est base 29402336, curr base 30661888
gc #36: min 19085432, max 41429616, est base 29602979, curr base 31408768
gc #37: min 19085432, max 42724544, est base 30915135, curr base 42724544
gc #38: min 19085432, max 42724544, est base 31095390, curr base 32717688
gc #39: min 19085432, max 42724544, est base 31907458, curr base 39216072
gc #40: min 19085432, max 42724544, est base 32093021, curr base 33763088
gc #41: min 19085432, max 42724544, est base 32281586, curr base 33978672
gc #42: min 19085432, max 42724544, est base 32543090, curr base 34896632
gc #43: min 19085432, max 42724544, est base 32743548, curr base 34547672
gc #44: min 19085432, max 42724544, est base 33191109, curr base 37219160
gc #45: min 19085432, max 42724544, est base 33659862, curr base 37878640
gc #46: min 19085432, max 42724544, est base 34162262, curr base 38683864
gc #47: min 19085432, max 42724544, est base 34624103, curr base 38780680
gc #48: min 19085432, max 42724544, est base 35125267, curr base 39635752
gc #49: min 19085432, max 42724544, est base 35547207, curr base 39344672
gc #50: min 19085432, max 42724544, est base 35827942, curr base 38354560
gc #51: min 19085432, max 42724544, est base 36185625, curr base 39404776
gc #52: min 19085432, max 52995432, est base 37866605, curr base 52995432
gc #53: min 19085432, max 52995432, est base 39230884, curr base 51509400
gc #54: min 19085432, max 52995432, est base 39651220, curr base 43434248
gc #55: min 19085432, max 52995432, est base 40010377, curr base 43242792
gc #56: min 19085432, max 52995432, est base 40443827, curr base 44344880
gc #57: min 19085432, max 52995432, est base 40979365, curr base 45799208
gc #58: min 19085432, max 52995432, est base 41337723, curr base 44562952
gc #59: min 19085432, max 57831608, est base 42987111, curr base 57831608
hit /gc for first time
gc #60: min 19085432, max 57831608, est base 42763791, curr base 40753920
gc #61: min 19085432, max 57831608, est base 42427528, curr base 39401168
gc #62: min 19085432, max 57831608, est base 42125779, curr base 39410040
gc #63: min 19085432, max 57831608, est base 41850385, curr base 39371848
gc #64: min 19085432, max 57831608, est base 41606578, curr base 39412320
gc #65: min 19085432, max 57831608, est base 41386124, curr base 39402040
```
</details>
This test, after storing some basic data in the request's SDK context, generates an error which SDK's express error handling middleware will capture. We can see that we started at a base of ~11.6MB, climbed steadily throughout the test to ~40-50MB toward the end, returned to ~39.4MB after the test ends, and were then still at ~39.4MB after 30 seconds and more GCing. This was worrysome, being 30MB over our baseline after 1000 captures. Something was up with capturing exceptions and we uncovered and fixed a memory leak as a result. Now the test returns to a baseline of ~13MB; the slight increase over 11.6MB is due to some warmup costs, but the marginal cost of additional capturing is zero (i.e. we return to that ~13MB baseline whether we do 1000 captures or 5000).

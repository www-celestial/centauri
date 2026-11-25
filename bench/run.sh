#!/bin/bash
# bench/run.sh micro|startup|load [ROUNDS]: Centauri's measures, under the heavy lock, one JSON line a measure in
# $OUT (~/.cache/centauri-bench/results.jsonl). CESIA, CESIA_STD: the binary and the std/ to measure with.
#   micro: the cost of a request in the program (bench/micro.ce), Centauri beside std/http alone.
#   startup: from the command to the first 200, then the memory at rest ($PROBE), Centauri and std/http
#            alternated.
#   load: http_load, 256 kept connections, 4 threads, 2 s a measure, on /hello, std/http then Centauri, alternated
#         (the limit of an address raised: the load comes from one);
#         servers on cores 0,1,4,5, the client on 2,3,6,7.
set -u
cd "$(dirname "$0")/.."
B=${CESIA:-cesia}
OUT=${OUT:-$HOME/.cache/centauri-bench/results.jsonl}
P=${PROBE:?PROBE: a program "probe PORT PATH cmd..." that prints the ms to the first 200 and the RSS in KB}
L=${HTTP_LOAD:?HTTP_LOAD: the http_load of Cesia (bench/http_load.exe)}
mkdir -p "$(dirname "$OUT")"
rounds=${2:-21}
tag=${TAG:-$(basename "$B")}
note() { echo "{\"Bench\":\"$1\",\"Tag\":\"$tag\",\"Load\":\"$(cut -d' ' -f1-3 /proc/loadavg)\",$2}" >> "$OUT"; }
case "$1" in
micro)
  $B run --allow native=cepheus,ffi=sodium,env bench/micro.ce "$rounds" 2000 | while read -r l; do echo "${l%\}},\"Tag\":\"$tag\",\"Load\":\"$(cut -d' ' -f1-3 /proc/loadavg)\"}" >> "$OUT"; done
  ;;
startup)
  for r in $(seq "$rounds"); do
    for s in plain centauri; do
      if [ $(( r % 2 )) = 0 ]; then s=$([ $s = plain ] && echo centauri || echo plain); fi
      if [ $s = plain ]; then out=$(PORT=18191 $P 18191 /hello $B run --allow native=cepheus,ffi=sodium,env,net=:18191 bench/plain.ce)
      else out=$(APP_PORT=18192 APP_LOG_REQUESTS=false APP_GET_DB=same $P 18192 /hello $B run --allow native=cepheus,ffi=sodium,env,net=:18192 bench/serve.ce); fi
      set -- $out
      note startup "\"Server\":\"$s\",\"Round\":$r,\"Ms\":$1,\"RssKb\":$2"
      set -- startup
    done
  done
  ;;
load)
  ulimit -n 100000
  (PORT=18193 exec setsid taskset -c 0,1,4,5 $B run --allow native=cepheus,ffi=sodium,env,net=:18193 bench/plain.ce > /dev/null 2>&1) & p1=$!
  (APP_PORT=18194 APP_LOG_REQUESTS=false APP_LIMIT_IP=1000000 APP_GET_DB=same exec setsid taskset -c 0,1,4,5 $B run --allow native=cepheus,ffi=sodium,env,net=:18194 bench/serve.ce > /dev/null 2>&1) & p2=$!
  trap 'kill -TERM -- -$p1 -$p2 2>/dev/null' EXIT
  sleep 2
  for r in $(seq "$rounds"); do
    for port in 18193 18194; do
      if [ $(( r % 2 )) = 0 ]; then port=$([ $port = 18193 ] && echo 18194 || echo 18193); fi
      name=$([ $port = 18193 ] && echo plain || echo centauri)
      taskset -c 2,3,6,7 $L --port $port --connections 256 --threads 4 --seconds 1 --path /hello > /dev/null 2>&1
      got=$(taskset -c 2,3,6,7 $L --port $port --connections 256 --threads 4 --seconds 2 --path /hello 2>&1 | tr '\n' ' ')
      rss=$(${RSS:?RSS: a program "rss PID" that prints the RSS of a tree in KB} $([ $port = 18193 ] && echo $p1 || echo $p2))
      note load "\"Server\":\"$name\",\"Round\":$r,\"RssKb\":$rss,\"Out\":\"$(echo "$got" | tr -d '"')\""
    done
  done
  ;;
esac

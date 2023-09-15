#!/bin/bash

set -e

fd -t f -I -H '\~$' | xargs rm -f

INLINE_RUNTIME_CHUNK=false yarn run build

zopfli build/static/**/*.css
zopfli build/static/**/*.js
brotli build/static/**/*.css
brotli build/static/**/*.js

./bin/update_version.js > build/version.json
./bin/insert_version.js build/version.json build/index.html

rm -fr build.zip && apack build.zip build

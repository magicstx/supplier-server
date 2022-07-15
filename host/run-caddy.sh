#!/bin/sh

pwd=$(caddy hash-password --plaintext $BASIC_PASSWORD)
echo "$BASIC_USERNAME $pwd" > /etc/caddy/password

caddy run --config /etc/caddy/Caddyfile
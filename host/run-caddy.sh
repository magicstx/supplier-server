#!/bin/sh

echo "$BASIC_USERNAME $(caddy hash-password --plaintext $BASIC_PASSWORD)" > /etc/caddy/password
cat /etc/caddy/password

caddy run --config /etc/caddy/Caddyfile
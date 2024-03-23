FROM caddy:2.7.6-alpine

COPY Caddyfile /etc/caddy/Caddyfile

COPY run-caddy.sh ./
RUN chmod 0755 ./run-caddy.sh
CMD [ "./run-caddy.sh" ]
FROM caddy:2.5.2-alpine

COPY Caddyfile /etc/caddy/Caddyfile

COPY run-caddy.sh ./
RUN chmod 0755 ./run-caddy.sh
CMD [ "./run-caddy.sh" ]
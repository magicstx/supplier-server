FROM grafana/loki:1.4.1

COPY ./loki.yaml /etc/loki/local-config.yaml

ENTRYPOINT ["/usr/bin/loki"]

CMD ["-config.file=/etc/loki/local-config.yaml"]

EXPOSe 3100
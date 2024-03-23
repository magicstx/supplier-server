FROM grafana/loki:2.9.6

COPY ./loki.yaml /etc/loki/local-config.yaml

ENTRYPOINT ["/usr/bin/loki"]
CMD ["-config.file=/etc/loki/local-config.yaml"]
EXPOSE 3100
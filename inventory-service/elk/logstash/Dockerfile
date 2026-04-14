FROM docker.elastic.co/logstash/logstash:8.13.4

USER root

# Baixa o driver JDBC do PostgreSQL (necessário para os pipelines financeiro e estoque)
RUN curl -fsSL \
  https://jdbc.postgresql.org/download/postgresql-42.7.3.jar \
  -o /usr/share/logstash/logstash-core/lib/jars/postgresql-42.7.3.jar

USER logstash

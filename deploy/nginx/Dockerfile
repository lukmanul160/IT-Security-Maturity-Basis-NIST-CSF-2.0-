FROM nginx:stable-alpine
RUN apk add --no-cache openssl
COPY 15-local-tls.sh /docker-entrypoint.d/15-local-tls.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/15-local-tls.sh \
    && chmod +x /docker-entrypoint.d/15-local-tls.sh

# Multi-stage build for blog-service (unified analytics + info API).
# The `test-support` feature is intentionally excluded here — the prod image
# must never contain the in-memory profile store bypass.
FROM rust:1-bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock* ./
COPY src ./src
COPY benches ./benches

RUN cargo build --release --bin blog-service

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/blog-service /usr/local/bin/

EXPOSE 8080
CMD ["blog-service"]

# Multi-stage build for analytics-ingestion
FROM rust:1-bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock* ./
COPY src ./src

RUN cargo build --release --bin analytics-ingestion

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/analytics-ingestion /usr/local/bin/

EXPOSE 8080
CMD ["analytics-ingestion"]

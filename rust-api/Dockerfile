# syntax=docker/dockerfile:1
# Build context: repository root with `docker build -f rust-api/Dockerfile .`
# Or from rust-api/: `docker build -f Dockerfile .` (see rust-api/README.md)
FROM rust:1.84-bookworm AS builder
WORKDIR /app
COPY rust-api/Cargo.toml rust-api/Cargo.lock* ./rust-api/
COPY rust-api/src ./rust-api/src
WORKDIR /app/rust-api
RUN cargo build --locked --release --bin rust_api

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/rust-api/target/release/rust_api /app/rust_api
ENV PORT=8080
EXPOSE 8080
USER nobody
CMD ["/app/rust_api"]

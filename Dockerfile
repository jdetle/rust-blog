FROM rust:1.85-bookworm AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src/ src/

RUN cargo build --release --bin rust-blog

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/target/release/rust-blog /app/rust-blog
COPY src/root.html /app/src/root.html
COPY posts/ /app/posts/

ENV CONTENT_DIR=/app
ENV PORT=8080
ENV RUST_LOG=rust_blog=info,tower_http=info

EXPOSE 8080

CMD ["/app/rust-blog"]

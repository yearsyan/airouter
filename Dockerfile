FROM node:22-bookworm-slim AS web-builder

WORKDIR /app/web

COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./

RUN corepack enable && pnpm install --frozen-lockfile

COPY web/ ./

RUN pnpm build

FROM rust:1-bookworm AS rust-builder

WORKDIR /app

COPY Cargo.toml Cargo.lock build.rs ./
COPY src ./src
COPY --from=web-builder /app/web/dist ./web/dist

RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 airouter

WORKDIR /app

COPY --from=rust-builder /app/target/release/airouter /usr/local/bin/airouter
COPY config.example.yml /app/config.example.yml

USER airouter

EXPOSE 443

ENTRYPOINT ["/usr/local/bin/airouter"]
CMD ["--config", "/app/config.yml"]

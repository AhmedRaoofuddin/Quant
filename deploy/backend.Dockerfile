# syntax=docker/dockerfile:1
# ---- build stage: compile + run the test suite ----------------------------
FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
        g++ cmake ninja-build ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY backend/ ./backend/
RUN cmake -S backend -B backend/build -G Ninja -DCMAKE_BUILD_TYPE=Release \
    && cmake --build backend/build

# Execution is unrestricted in the container, so the tests run here as a build gate.
RUN cd backend/build && ctest --output-on-failure

# ---- runtime stage: minimal image with just the binary -------------------
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 alphaforge

WORKDIR /app
COPY --from=build /src/backend/build/alphaforge /usr/local/bin/alphaforge
USER alphaforge

ENV AF_ENVIRONMENT=production \
    AF_LOG_JSON=true \
    AF_DATA_DIR=/app/data \
    AF_API_HOST=0.0.0.0 \
    AF_API_PORT=8000
VOLUME ["/app/data"]
EXPOSE 8000

# Default: serve the REST API. Override with `discover` / `crawl` for one-shot jobs.
ENTRYPOINT ["alphaforge"]
CMD ["serve"]

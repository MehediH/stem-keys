FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/importer \
    && /opt/importer/bin/pip install --no-cache-dir 'yt-dlp[default]==2026.8.19'
ENV PATH="/opt/importer/bin:${PATH}"
WORKDIR /app
COPY server.py .
USER node
EXPOSE 8080
CMD ["python3", "server.py"]

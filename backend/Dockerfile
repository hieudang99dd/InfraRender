FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    INFRARENDER_ENV=production \
    INFRARENDER_DATA_DIR=/data \
    PORT=8000

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --no-create-home appuser \
    && mkdir /data \
    && chown appuser:appuser /data

COPY --chown=appuser:appuser . .
USER appuser
VOLUME ["/data"]
EXPOSE 8000

# Configure runtime secrets, CORS and the public URL on the backend host.
# Mount a persistent volume at /data for projects, reference images and renders.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/api/health', timeout=3)" || exit 1

CMD ["sh", "-c", "exec python -m uvicorn main:app --host 0.0.0.0 --port \"${PORT:-8000}\""]

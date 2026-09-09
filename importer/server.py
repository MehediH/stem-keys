"""Bounded, public-video-only audio importer. No cookies or user accounts."""
import json
import base64
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 100 * 1024 * 1024
SLOTS = threading.BoundedSemaphore(2)


def download(url, directory, report=lambda *_: None):
    command = [
        os.environ.get('YT_DLP', 'yt-dlp'), '--ignore-config', '--no-playlist',
        '--no-cache-dir', '--progress', '--newline', '--progress-delta', '0.3',
        '--progress-template', 'download:stem-progress:%(progress)j',
        '--no-warnings', '--js-runtimes', 'node',
        '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1',
        '--max-filesize', str(MAX_BYTES), '--match-filter',
        'duration <= 600 & !is_live & age_limit < 18',
        '--format', 'bestaudio[ext=m4a]/bestaudio',
        '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '5',
        '--write-info-json', '--output', str(Path(directory) / 'audio.%(ext)s'),
        '--', url,
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    expired = threading.Event()
    def expire():
        expired.set()
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    timer = threading.Timer(90, expire)
    timer.start()
    failure = 'unavailable'
    try:
        for line in process.stdout:
            if 'Sign in to confirm' in line:
                failure = 'youtube_verification_required'
            elif 'HTTP Error 403' in line:
                failure = 'youtube_forbidden'
            elif 'ERROR:' in line:
                failure = 'download_or_conversion_error'
            if not line.startswith('stem-progress:'):
                continue
            try:
                progress = json.loads(line[len('stem-progress:'):])
            except ValueError:
                continue
            total = progress.get('total_bytes') or progress.get('total_bytes_estimate')
            received = progress.get('downloaded_bytes', 0)
            if progress.get('status') == 'finished':
                report('Importing from YouTube', 100)
                report('Preparing audio', None)
            elif isinstance(total, (int, float)) and total > 0:
                report('Importing from YouTube', min(100, received / total * 100))
        code = process.wait()
        if expired.is_set():
            raise ValueError('YouTube took too long. Try again or upload an audio file.')
    finally:
        timer.cancel()
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        process.stdout.close()
    audio = Path(directory) / 'audio.mp3'
    if code or not audio.exists():
        print(json.dumps({'event': 'import_failed', 'reason': failure}), flush=True)
        if failure == 'youtube_verification_required':
            raise ValueError('YouTube is asking this server to sign in. Please upload an audio file instead.')
        if failure == 'youtube_forbidden':
            raise ValueError('YouTube blocked this audio download. Please upload an audio file instead.')
        # Do not expose downloader logs, signed media URLs, or upstream HTML.
        raise ValueError('Could not import this song. Use a public, unrestricted video under 10 minutes, or upload an audio file.')
    if not 0 < audio.stat().st_size <= MAX_BYTES:
        raise ValueError('This audio file is too large. Upload a smaller file.')
    info = json.loads((Path(directory) / 'audio.info.json').read_text())
    title = str(info.get('title') or 'YouTube audio')[:180]
    return audio, title


class Handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('X-Importer-Version', 'progress-2')
        super().end_headers()

    def log_message(self, *_args):
        pass

    def error(self, message, status):
        payload = json.dumps({'error': message}).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path != '/health':
            return self.error('Not found.', 404)
        self.send_response(200)
        self.send_header('Content-Length', '2')
        self.end_headers()
        self.wfile.write(b'ok')

    def do_POST(self):
        if self.path != '/import':
            return self.error('Not found.', 404)
        self.connection.settimeout(15)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096:
                return self.error('Invalid request size.', 413)
            payload = json.loads(self.rfile.read(length))
            url = payload.get('url')
            if not isinstance(url, str) or not re.fullmatch(r'https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}', url):
                return self.error('Invalid YouTube song link.', 400)
        except (ValueError, AttributeError, TimeoutError):
            return self.error('Invalid request.', 400)
        if not SLOTS.acquire(blocking=False):
            return self.error('The importer is busy. Try again shortly.', 429)
        streaming = payload.get('stream') is True or 'application/x-ndjson' in self.headers.get('Accept', '')
        print(json.dumps({'event': 'import_started', 'streaming': streaming}), flush=True)
        def emit(event):
            self.wfile.write((json.dumps(event) + '\n').encode())
            self.wfile.flush()
        def report(stage, progress):
            if streaming:
                emit({'type': 'progress', 'stage': stage, 'progress': progress})
        try:
            if streaming:
                self.send_response(200)
                self.send_header('Content-Type', 'application/x-ndjson')
                self.send_header('Cache-Control', 'no-store, no-transform')
                self.end_headers()
                report('Importing from YouTube', 0)
            with tempfile.TemporaryDirectory(prefix='stem-keys-') as directory:
                audio, title = download(url, directory, report)
                if streaming:
                    emit({'type': 'audio', 'title': title, 'size': audio.stat().st_size})
                    with audio.open('rb') as stream:
                        while chunk := stream.read(64 * 1024):
                            emit({'type': 'chunk', 'data': base64.b64encode(chunk).decode('ascii')})
                    emit({'type': 'complete'})
                    return
                from urllib.parse import quote
                self.send_response(200)
                self.send_header('Content-Type', 'audio/mpeg')
                self.send_header('Content-Length', str(audio.stat().st_size))
                self.send_header('X-Audio-Title', quote(title, safe=''))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                with audio.open('rb') as stream:
                    while chunk := stream.read(64 * 1024):
                        self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        except ValueError as error:
            if streaming:
                emit({'type': 'error', 'error': str(error)})
            else:
                self.error(str(error), 422)
        except Exception:
            if streaming:
                emit({'type': 'error', 'error': 'YouTube import failed. Try uploading an audio file.'})
            else:
                self.error('YouTube import failed. Try uploading an audio file.', 502)
        finally:
            SLOTS.release()


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler)
    server.daemon_threads = False
    # PID 1 must handle SIGTERM so image rollouts can replace the process.
    signal.signal(signal.SIGTERM, lambda *_: threading.Thread(target=server.shutdown).start())
    with server:
        server.serve_forever()

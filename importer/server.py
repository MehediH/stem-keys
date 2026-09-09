"""Bounded, public-video-only audio importer. No cookies or user accounts."""
import json
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


def download(url, directory):
    command = [
        os.environ.get('YT_DLP', 'yt-dlp'), '--ignore-config', '--no-playlist',
        '--no-cache-dir', '--no-progress', '--no-warnings', '--js-runtimes', 'node',
        '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1',
        '--max-filesize', str(MAX_BYTES), '--match-filter',
        'duration <= 600 & !is_live & age_limit < 18',
        '--format', 'bestaudio[ext=m4a]/bestaudio',
        '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '5',
        '--write-info-json', '--output', str(Path(directory) / 'audio.%(ext)s'),
        '--', url,
    ]
    with open(Path(directory) / 'download.log', 'wb') as log:
        process = subprocess.Popen(command, stdout=log, stderr=log, start_new_session=True)
        try:
            code = process.wait(timeout=90)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise ValueError('YouTube took too long. Try again or upload an audio file.')
    audio = Path(directory) / 'audio.mp3'
    if code or not audio.exists():
        # Do not expose downloader logs, signed media URLs, or upstream HTML.
        raise ValueError('Could not import this song. Use a public, unrestricted video under 10 minutes, or upload an audio file.')
    if not 0 < audio.stat().st_size <= MAX_BYTES:
        raise ValueError('This audio file is too large. Upload a smaller file.')
    info = json.loads((Path(directory) / 'audio.info.json').read_text())
    title = str(info.get('title') or 'YouTube audio')[:180]
    return audio, title


class Handler(BaseHTTPRequestHandler):
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
            url = json.loads(self.rfile.read(length)).get('url')
            if not isinstance(url, str) or not re.fullmatch(r'https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}', url):
                return self.error('Invalid YouTube song link.', 400)
        except (ValueError, AttributeError, TimeoutError):
            return self.error('Invalid request.', 400)
        if not SLOTS.acquire(blocking=False):
            return self.error('The importer is busy. Try again shortly.', 429)
        try:
            with tempfile.TemporaryDirectory(prefix='stem-keys-') as directory:
                audio, title = download(url, directory)
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
            self.error(str(error), 422)
        except Exception:
            self.error('YouTube import failed. Try uploading an audio file.', 502)
        finally:
            SLOTS.release()


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler).serve_forever()

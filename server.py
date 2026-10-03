"""Local-only lab. One shared brain; one browser session should run at a time."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Lock
import json
import math
from brain import Brain

ROOT = Path(__file__).resolve().parent
brain = None
lock = Lock()
EXTENSION_ID = (ROOT / 'extension-id.txt').read_text().strip()
ALLOWED_ORIGINS = {'http://127.0.0.1:8765', 'http://localhost:8765',
                   f'chrome-extension://{EXTENSION_ID}'}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

    def respond(self, payload, status=200):
        raw = json.dumps(payload, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers(); self.wfile.write(raw)

    def do_OPTIONS(self):
        origin = self.headers.get('Origin')
        if origin not in ALLOWED_ORIGINS:
            return self.respond({'error': 'Origin rejected'}, 403)
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Vary', 'Origin')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/status':
            return self.respond(brain.meta)
        return super().do_GET()

    def do_POST(self):
        if self.headers.get('Origin') is not None and self.headers.get('Origin') not in ALLOWED_ORIGINS:
            return self.respond({'error': 'Origin rejected'}, 403)
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > 100000:
                raise ValueError('Invalid request size')
            data = json.loads(self.rfile.read(length))
            with lock:
                if self.path == '/api/reset':
                    brain.reset(int(data.get('seed', 42)))
                    return self.respond({'ok': True})
                if self.path != '/api/step':
                    return self.respond({'error': 'Not found'}, 404)
                w, h, pixels = data['width'], data['height'], data['pixels']
                if not isinstance(w, int) or not isinstance(h, int) or not (1 <= w <= 128 and 1 <= h <= 128):
                    raise ValueError('Invalid image dimensions')
                if len(pixels) != w*h or any(not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in pixels):
                    raise ValueError('Invalid luminance values')
                result = brain.step(pixels, w, h, bool(data.get('enabled', True)))
            self.respond(result)
        except (ValueError, KeyError, TypeError) as exc:
            self.respond({'error': str(exc)}, 400)

if __name__ == '__main__':
    print('Loading MaleCNS brain…', flush=True)
    brain = Brain()
    print(f'{brain.n:,} neurons loaded. Open http://127.0.0.1:8765', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()

#!/usr/bin/env python3
"""Local server for development and iPad testing: like `python3 -m http.server`, but always
serves this project folder and tells the browser not to cache, so every reload gets the
current version of every file. (A plain http.server lets Safari keep some files and refetch
others, which can mix old and new code after an edit.)

    python3 tools/dev-server.py [port]           this Mac only (127.0.0.1)
    python3 tools/dev-server.py [port] --lan     also reachable from an iPad on the same Wi-Fi
"""
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webmanifest": "application/manifest+json", ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    os.chdir(root)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8766
    host = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"
    print(f"Serving {os.path.abspath(root)} on http://{host}:{port}/ (no caching)", flush=True)
    http.server.ThreadingHTTPServer((host, port), NoCache).serve_forever()

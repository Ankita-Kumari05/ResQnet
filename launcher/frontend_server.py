"""
ResQnet Production Frontend & Reverse Proxy Server
Serves static React production bundle from frontend/dist and proxies /api to backend.
Zero external runtime dependencies (uses Python standard library).
"""
import sys
import os
import argparse
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.error

# Ensure standard MIME types
mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/json", ".json")

class ResQnetFrontendHandler(BaseHTTPRequestHandler):
    dist_dir = ""
    backend_url = "http://127.0.0.1:8000"

    def log_message(self, format, *args):
        # Keep console output quiet unless error
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/") or self.path == "/api" or self.path.startswith("/health"):
            self._proxy_request("GET")
        else:
            self._serve_static()

    def do_POST(self):
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_request("POST")
        else:
            self.send_error(405, "Method Not Allowed")

    def do_PUT(self):
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_request("PUT")
        else:
            self.send_error(405, "Method Not Allowed")

    def do_PATCH(self):
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_request("PATCH")
        else:
            self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy_request("DELETE")
        else:
            self.send_error(405, "Method Not Allowed")

    def _serve_static(self):
        # Clean path, strip query string
        clean_path = self.path.split("?")[0].lstrip("/")
        file_path = os.path.join(self.dist_dir, clean_path)

        # SPA fallback: if file doesn't exist or is a directory or path has no extension, serve index.html
        if not os.path.exists(file_path) or os.path.isdir(file_path) or "." not in os.path.basename(file_path):
            file_path = os.path.join(self.dist_dir, "index.html")

        if not os.path.exists(file_path):
            self.send_error(404, "Not Found")
            return

        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            if file_path.endswith((".js", ".css", ".svg", ".woff2")):
                self.send_header("Cache-Control", "public, max-age=31536000")
            else:
                self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def _proxy_request(self, method):
        target_url = f"{self.backend_url}{self.path}"
        body = None
        content_length = self.headers.get("Content-Length")
        if content_length:
            body = self.rfile.read(int(content_length))

        headers = {}
        for key, val in self.headers.items():
            if key.lower() not in ("host", "content-length"):
                headers[key] = val

        req = urllib.request.Request(target_url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                self.send_response(resp.status)
                for header_key, header_val in resp.getheaders():
                    if header_key.lower() not in ("transfer-encoding", "content-length"):
                        self.send_header(header_key, header_val)
                resp_body = resp.read()
                self.send_header("Content-Length", str(len(resp_body)))
                self.end_headers()
                self.wfile.write(resp_body)
        except urllib.error.HTTPError as err:
            self.send_response(err.code)
            for header_key, header_val in err.headers.items():
                if header_key.lower() not in ("transfer-encoding", "content-length"):
                    self.send_header(header_key, header_val)
            err_body = err.read()
            self.send_header("Content-Length", str(len(err_body)))
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as e:
            self.send_error(502, f"Bad Gateway: Unable to reach backend ({e})")


def run_server(port: int, dist_dir: str, backend_url: str):
    ResQnetFrontendHandler.dist_dir = os.path.abspath(dist_dir)
    ResQnetFrontendHandler.backend_url = backend_url.rstrip("/")
    server = HTTPServer(("127.0.0.1", port), ResQnetFrontendHandler)
    print(f"ResQnet Frontend Server listening on http://127.0.0.1:{port} (serving {dist_dir})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ResQnet Frontend Static & Reverse Proxy Server")
    parser.add_argument("--port", type=int, default=5173, help="Port to listen on")
    parser.add_argument("--dir", type=str, default="./frontend/dist", help="Directory containing built frontend")
    parser.add_argument("--backend", type=str, default="http://127.0.0.1:8000", help="Backend API URL")
    args = parser.parse_args()

    run_server(args.port, args.dir, args.backend)

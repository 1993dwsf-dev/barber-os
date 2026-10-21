"""Receptor OTP falso para E2E local. Não executa em produção."""
import http.server
import json
import pathlib

OUTPUT = pathlib.Path("/tmp/barber-smoke-otp.json")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/v1/email/otp":
            self.send_error(404)
            return
        size = int(self.headers.get("Content-Length", "0"))
        if size <= 0 or size > 4096:
            self.send_error(400)
            return
        try:
            payload = json.loads(self.rfile.read(size))
            email, otp = payload["to"], payload["otp"]
            if not isinstance(email, str) or not isinstance(otp, str) or len(otp) != 6:
                raise ValueError("invalid OTP payload")
            OUTPUT.write_text(json.dumps({"to": email, "otp": otp}))
        except (KeyError, ValueError, json.JSONDecodeError):
            self.send_error(400)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"success":true}')

    def log_message(self, fmt, *args):
        # Nunca imprimir códigos de autenticação.
        pass

if __name__ == "__main__":
    http.server.HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()

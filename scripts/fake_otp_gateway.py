"""Receptor OTP falso para E2E local. Não executa em produção."""
import http.server
import json
import pathlib

OUTPUT = pathlib.Path("/tmp/barber-smoke-otp.json")
DIAGNOSTIC = pathlib.Path("/tmp/barber-otp-diagnostic.json")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        size = int(self.headers.get("Content-Length", "0"))
        diagnostic = {"path": self.path, "content_type": self.headers.get("Content-Type"), "size": size}
        if self.path != "/v1/email/otp":
            diagnostic["reason"] = "unexpected path"
            DIAGNOSTIC.write_text(json.dumps(diagnostic))
            self.send_error(404)
            return
        if size <= 0 or size > 4096:
            diagnostic["reason"] = "invalid content length"
            DIAGNOSTIC.write_text(json.dumps(diagnostic))
            self.send_error(400)
            return
        try:
            payload = json.loads(self.rfile.read(size))
            diagnostic["keys"] = list(payload.keys()) if isinstance(payload, dict) else []
            email, otp = payload["to"], payload["otp"]
            diagnostic["email_type"] = type(email).__name__
            diagnostic["otp_type"] = type(otp).__name__
            diagnostic["otp_length"] = len(str(otp))
            if not isinstance(email, str) or not isinstance(otp, str) or len(otp) != 6:
                raise ValueError("invalid OTP payload")
            OUTPUT.write_text(json.dumps({"to": email, "otp": otp}))
        except (KeyError, ValueError, json.JSONDecodeError) as err:
            diagnostic["reason"] = type(err).__name__
            DIAGNOSTIC.write_text(json.dumps(diagnostic))
            self.send_error(400)
            return
        diagnostic["status"] = 200
        DIAGNOSTIC.write_text(json.dumps(diagnostic))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"success":true}')

    def log_message(self, fmt, *args):
        # Nunca imprimir códigos de autenticação.
        pass

if __name__ == "__main__":
    http.server.HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()

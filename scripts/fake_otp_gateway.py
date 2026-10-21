"""Fake local da API Resend, disponível apenas em 127.0.0.1 para testes E2E."""
import http.server
import json
import pathlib
import re

OUTPUT = pathlib.Path("/tmp/barber-smoke-otp.json")
DIAGNOSTIC = pathlib.Path("/tmp/barber-otp-diagnostic.json")

class Handler(http.server.BaseHTTPRequestHandler):
    def read_request_body(self):
        if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            chunks = []
            total = 0
            while True:
                header = self.rfile.readline(100)
                if not header or len(header) >= 100:
                    raise ValueError("invalid chunk header")
                size = int(header.split(b";", 1)[0].strip(), 16)
                if size == 0:
                    while self.rfile.readline(4096) not in (b"\r\n", b"\n", b""):
                        pass
                    break
                total += size
                if total > 4096:
                    raise ValueError("body too large")
                chunk = self.rfile.read(size)
                if len(chunk) != size or self.rfile.read(2) != b"\r\n":
                    raise ValueError("invalid chunk framing")
                chunks.append(chunk)
            return b"".join(chunks)
        size = int(self.headers.get("Content-Length", "0"))
        if not 0 < size <= 4096:
            raise ValueError("invalid content length")
        return self.rfile.read(size)

    def do_POST(self):
        diagnostic = {"path": self.path, "content_type": self.headers.get("Content-Type")}
        if self.path != "/emails":
            diagnostic["reason"] = "unexpected path"
            DIAGNOSTIC.write_text(json.dumps(diagnostic))
            self.send_error(404)
            return
        try:
            if self.headers.get("Authorization") != "Bearer local-smoke-only":
                raise ValueError("invalid API key")
            payload = json.loads(self.read_request_body())
            diagnostic["keys"] = sorted(payload.keys()) if isinstance(payload, dict) else []
            to = payload["to"]
            recipients = to if isinstance(to, list) else [to]
            if len(recipients) != 1 or not isinstance(recipients[0], str):
                raise ValueError("invalid recipients")
            if not isinstance(payload.get("from"), str) or not payload["from"]:
                raise ValueError("invalid sender")
            if not isinstance(payload.get("subject"), str) or not payload["subject"]:
                raise ValueError("invalid subject")
            match = re.search(r"\b\d{6}\b", payload["text"])
            if match is None:
                raise ValueError("OTP not found")
            OUTPUT.write_text(json.dumps({"to": recipients[0], "otp": match.group(0)}))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as err:
            diagnostic["reason"] = type(err).__name__
            DIAGNOSTIC.write_text(json.dumps(diagnostic))
            self.send_error(400)
            return
        diagnostic["status"] = 200
        DIAGNOSTIC.write_text(json.dumps(diagnostic))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"id":"email_smoke_local"}')

    def log_message(self, fmt, *args):
        # Não imprimir destinatários ou códigos de acesso nos logs.
        pass

if __name__ == "__main__":
    http.server.HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()

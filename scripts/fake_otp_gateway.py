"""Receptor OTP falso para E2E local. Não executa em produção."""
import http.server
import json
import pathlib

OUTPUT = pathlib.Path("/tmp/barber-smoke-otp.json")
DIAGNOSTIC = pathlib.Path("/tmp/barber-otp-diagnostic.json")

class Handler(http.server.BaseHTTPRequestHandler):
    def read_request_body(self):
        # Axios pode enviar JSON usando HTTP/1.1 Transfer-Encoding: chunked.
        # O receptor é utilizado exclusivamente em 127.0.0.1 no CI.
        if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            chunks = []
            total = 0
            while True:
                header = self.rfile.readline(100)
                if not header or len(header) >= 100:
                    raise ValueError("invalid chunk header")
                size = int(header.split(b";", 1)[0].strip(), 16)
                if size == 0:
                    # Consumir trailers até o fim do corpo.
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
        diagnostic = {
            "path": self.path,
            "content_type": self.headers.get("Content-Type"),
            "transfer_encoding": self.headers.get("Transfer-Encoding", ""),
            "content_length": self.headers.get("Content-Length"),
        }
        if self.path != "/v1/email/otp":
            diagnostic["reason"] = "unexpected path"
            DIAGNOSTIC.write_text(json.dumps(diagnostic))
            self.send_error(404)
            return
        try:
            body = self.read_request_body()
            diagnostic["body_size"] = len(body)
            payload = json.loads(body)
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

"""Ensaio de exportação/restauração Convex exclusivamente em backend LOCAL descartável.

NUNCA executar contra dados hospedados. Este script aborta sem uma .env.local
que ateste deployment anônimo/local E URL loopback, sem seletor remoto.
O snapshot temporário só contém os dados fictícios do browser smoke.
"""
from __future__ import annotations
import json
import os
import pathlib
import re
import subprocess
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def assert_local_only():
    envfile = ROOT / ".env.local"
    if not envfile.is_file():
        raise RuntimeError("Proteção: .env.local ausente; restauração recusada")
    values = {}
    for line in envfile.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip("'\"")
    deployment = values.get("CONVEX_DEPLOYMENT", "")
    # O Convex CLI pode identificar backend local anônimo como anonymous:...
    if not deployment.startswith(("local:", "anonymous:")):
        raise RuntimeError("Proteção: deployment não é local/anônimo; restauração recusada")
    from urllib.parse import urlparse
    endpoint = urlparse(values.get("VITE_CONVEX_URL", values.get("CONVEX_URL", "")))
    if endpoint.scheme != "http" or endpoint.hostname not in ("localhost", "127.0.0.1", "::1") or not endpoint.port:
        raise RuntimeError("Proteção: URL Convex não aponta para loopback local")
    for key in ("CONVEX_DEPLOY_KEY", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"):
        if os.environ.get(key) or values.get(key):
            raise RuntimeError(f"Proteção: {key} presente; restauração recusada")

def run_convex(*args: str):
    # O modo Convex anônimo utiliza o backend local indicado em .env.local
    # como deployment padrão. NUNCA passar --prod ou seletor remoto.
    assert_local_only()
    if args[0] not in ("export", "import") or any(
        flag in args for flag in ("--prod", "--deployment", "--preview-name", "--preview-create")
    ):
        raise RuntimeError("Comando de backup fora da lista autorizada")
    result = subprocess.run(
        ["bunx", "convex", *args],
        cwd=ROOT, text=True, capture_output=True, timeout=180, check=False,
    )
    if result.returncode:
        # Logar somente diagnóstico de erro, sem documentos do snapshot.
        messages = [
            line[:250] for line in (result.stdout + "\n" + result.stderr).splitlines()
            if any(w in line.lower() for w in ("error", "failed", "unknown", "anonymous", "deployment"))
        ]
        raise RuntimeError(
            f"convex {args[0]} anônimo local falhou (código {result.returncode}): " +
            " | ".join(messages[-4:])[:700]
        )

def document_index(zip_path: pathlib.Path):
    result = {}
    with zipfile.ZipFile(zip_path) as zf:
        if zf.testzip() is not None:
            raise AssertionError("Snapshot ZIP corrompido")
        for name in zf.namelist():
            if not name.endswith("/documents.jsonl"):
                continue
            table = name.split("/")[0]
            docs = [json.loads(line) for line in zf.read(name).decode("utf-8").splitlines() if line.strip()]
            result[table] = sorted(
                (json.dumps(doc, sort_keys=True, ensure_ascii=False) for doc in docs)
            )
    return result


def main():
    assert_local_only()
    with tempfile.TemporaryDirectory(prefix="barber-local-restore-") as path:
        root = pathlib.Path(path)
        backup = root / "antes.zip"
        verified = root / "depois.zip"
        print("[restore QA] exportando dados fictícios do Convex local", flush=True)
        run_convex("export", "--include-file-storage", "--path", str(backup))
        before = document_index(backup)
        if len(before.get("sales", [])) < 1 or len(before.get("appointments", [])) < 1:
            raise AssertionError("O ambiente fictício não possui vendas e agendamentos para o ensaio")
        # Única mutação do ensaio: --replace no backend ANÔNIMO LOCAL (nunca remoto).
        assert_local_only()
        run_convex("import", "--replace", "--yes", str(backup))
        run_convex("export", "--include-file-storage", "--path", str(verified))
        after = document_index(verified)
        if before != after:
            diff = sorted(set(before) | set(after))
            mismatched = [table for table in diff if before.get(table) != after.get(table)]
            raise AssertionError("Restauração local não preservou tabelas: " + ", ".join(mismatched))
        print(
            f"[restore QA] OK: {len(after)} tabelas e {sum(map(len, after.values()))} "
            "documentos fictícios preservados após export/import ZIP em backend local", flush=True
        )


if __name__ == "__main__":
    main()

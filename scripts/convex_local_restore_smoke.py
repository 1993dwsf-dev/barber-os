"""Ensaio de exportação/restauração Convex exclusivamente em backend LOCAL descartável.

NUNCA executar contra dados hospedados. Este script aborta sem uma .env.local
que ateste CONVEX_DEPLOYMENT=local:..., e chama a CLI com --deployment local.
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
    match = re.search(r"^CONVEX_DEPLOYMENT=['\"]?([^'\"\r\n]+)", envfile.read_text(), re.M)
    if not match or not match.group(1).startswith("local:"):
        raise RuntimeError("Proteção: deployment não é local; restauração recusada")
    for key in ("CONVEX_DEPLOY_KEY", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"):
        if os.environ.get(key):
            raise RuntimeError(f"Proteção: {key} presente; restauração recusada")


def run_convex(*args: str):
    # Nenhuma opção para --prod, nenhum deployment remoto aceito.
    if args[0] not in ("export", "import") or "--deployment" not in args:
        raise RuntimeError("Comando de backup fora da lista autorizada")
    i = args.index("--deployment")
    if args[i + 1] != "local":
        raise RuntimeError("Destino diferente de local, operação recusada")
    result = subprocess.run(
        ["bunx", "convex", *args],
        cwd=ROOT, text=True, capture_output=True, timeout=180, check=False,
    )
    if result.returncode:
        # Não imprimir dados do snapshot nem informações sensíveis.
        raise RuntimeError(f"convex {args[0]} local falhou com código {result.returncode}")


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
        run_convex("export", "--deployment", "local", "--include-file-storage", "--path", str(backup))
        before = document_index(backup)
        if len(before.get("sales", [])) < 1 or len(before.get("appointments", [])) < 1:
            raise AssertionError("O ambiente fictício não possui vendas e agendamentos para o ensaio")
        # Única mutação do ensaio: --replace em LOCAL (nunca remoto).
        assert_local_only()
        run_convex("import", "--deployment", "local", "--replace", "--yes", str(backup))
        run_convex("export", "--deployment", "local", "--include-file-storage", "--path", str(verified))
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

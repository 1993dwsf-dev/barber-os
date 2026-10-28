"""Prova de exportação CSV no Chromium com dados fictícios do Convex local."""
import csv
import io
import pathlib
import re
from playwright.sync_api import expect


def run_csv_download(page, base_url):
    page.goto(base_url + "/app/relatorios", wait_until="domcontentloaded")
    expect(page.get_by_role("heading", name="Relatórios").first).to_be_visible(timeout=30000)
    button = page.get_by_role("button", name="CSV", exact=True).first
    expect(button).to_be_visible(timeout=30000)
    expect(button).to_be_enabled()
    with page.expect_download(timeout=18000) as info:
        button.click()
    download = info.value
    if not re.fullmatch(r"vendas-\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.csv", download.suggested_filename):
        raise AssertionError("Nome do download CSV de vendas inválido")
    contents = pathlib.Path(download.path()).read_bytes()
    if not contents.startswith(bytes([0xEF, 0xBB, 0xBF])):
        raise AssertionError("CSV de vendas sem BOM UTF-8")
    rows = list(csv.reader(io.StringIO(contents.decode("utf-8-sig")), delimiter=";"))
    if not rows or rows[0] != ["Número", "Data", "Cliente", "Barbeiro", "Itens", "Total", "Pago"]:
        raise AssertionError("Cabeçalho CSV incorreto")
    if len(rows) < 2 or any(len(row) != 7 for row in rows[1:]):
        raise AssertionError("CSV sem venda fictícia ou com colunas incorretas")
    # Não persistir arquivo com dados (mesmo fictícios) nem imprimi-los nos logs.
    print(f"[OK] csv-real-download: {len(rows)-1} linhas, sete colunas, BOM UTF-8", flush=True)

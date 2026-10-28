"""Smoke da demonstração pública: sem login, sem backend e sem dados reais."""
import re
from playwright.sync_api import expect


def run_public_demo(page, base):
    page.goto(base + "/", wait_until="domcontentloaded")
    page.get_by_role("link", name="Ver demonstração interativa").click()
    page.wait_for_url(re.compile(r"/demo(?:[?#].*)?$"), timeout=30000)

    expect(page.get_by_role("heading", name="Conheça o Barber OS")).to_be_visible(timeout=25000)
    expect(page.get_by_text("Demonstração interativa — dados fictícios")).to_be_visible()
    expect(page.get_by_text("R$ 155,00").first).to_be_visible()
    page.get_by_role("button", name=re.compile("Simular venda de pomada")).first.click()
    expect(page.get_by_text("R$ 190,00").last).to_be_visible()
    expect(page.get_by_role("status")).to_contain_text("Venda fictícia registrada")

    page.get_by_role("tab", name="Estoque").click()
    expect(page.get_by_text("7 unidades")).to_be_visible()
    page.get_by_role("tab", name="Agenda").click()
    page.get_by_role("button", name="Simular agendamento").click()
    expect(page.get_by_text("Cliente de exemplo")).to_be_visible()

    page.get_by_role("button", name="Reiniciar demonstração").click()
    expect(page.get_by_text("R$ 155,00").first).to_be_visible()
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(base + "/demo", wait_until="domcontentloaded")
    expect(page.get_by_role("heading", name="Conheça o Barber OS")).to_be_visible(timeout=25000)
    expect(page.get_by_role("tab", name="PDV")).to_be_visible()
    page.set_viewport_size({"width": 1440, "height": 900})
    print("[OK] public-demo: acesso sem login, venda, estoque, agenda, reset e mobile", flush=True)

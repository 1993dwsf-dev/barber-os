"""Testes de navegador do Barber OS com backend local e dados fictícios."""
import datetime as dt
import json
import time
import os
import pathlib
import re
import sys
import traceback
from playwright.sync_api import expect, sync_playwright
from barber_invites_smoke import run_barber_invites
from csv_browser_smoke import run_csv_download
from public_demo_smoke import run_public_demo

BASE = os.getenv("SMOKE_BASE_URL", "http://127.0.0.1:5173").rstrip("/")
EVIDENCE = pathlib.Path("artifacts/browser-smoke")
EVIDENCE.mkdir(parents=True, exist_ok=True)

def shot(page, name):
    page.screenshot(path=str(EVIDENCE / (name + ".png")), full_page=True)
    print("[OK]", name, page.url, flush=True)

def choose(dialog, page, index):
    dialog.locator('[role="combobox"]').nth(index).click()
    options = page.get_by_role("option")
    expect(options.first).to_be_visible(timeout=12000)
    options.first.click()

def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="pt-BR")
        page.set_default_timeout(18000)
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        stage = "public-demo"
        try:
            run_public_demo(page, BASE)
            stage = "login"
            page.goto(BASE + "/auth", wait_until="domcontentloaded", timeout=45000)
            expect(page.get_by_role("heading", name="Entre na sua barbearia")).to_be_visible(timeout=30000)
            expect(page.locator("#auth-email")).to_be_visible()
            shot(page, "01-login")

            stage = "visitante"
            page.get_by_role("button", name=re.compile("Entrar como visitante")).click()
            page.wait_for_url(re.compile(r"/onboarding(?:[?#].*)?$"), timeout=60000)
            expect(page.get_by_role("button", name="Ver o demo")).to_be_visible()
            shot(page, "02-onboarding")

            stage = "demo"
            page.get_by_role("button", name="Ver o demo").click()
            page.get_by_role("button", name="Abrir ambiente demo").click()
            page.wait_for_url(re.compile(r"/app(?:[?#].*)?$"), timeout=90000)
            expect(page.get_by_role("navigation").first).to_be_visible(timeout=45000)
            shot(page, "03-dashboard-demo")

            stage = "agenda"
            page.goto(BASE + "/app/agenda", wait_until="domcontentloaded")
            expect(page.get_by_role("heading", name="Agenda").first).to_be_visible(timeout=30000)
            page.get_by_role("button", name="Novo agendamento").click()
            dialog = page.get_by_role("dialog")
            expect(dialog.get_by_text("Novo agendamento")).to_be_visible()
            people = dialog.locator(".scrollbar-slim button")
            expect(people.first).to_be_visible(timeout=25000)
            client_name = people.first.locator("span").first.inner_text()
            people.first.click()
            choose(dialog, page, 0)
            choose(dialog, page, 1)
            future = dt.date.today() + dt.timedelta(days=14)
            future += dt.timedelta(days=(0 - future.weekday()) % 7)
            dialog.locator('input[type="date"]').fill(future.isoformat())
            dialog.locator('[role="combobox"]').nth(2).click()
            page.get_by_role("option", name="10:00", exact=True).click()
            dialog.get_by_role("button", name="Agendar", exact=True).click()
            expect(page.get_by_text("Agendamento criado")).to_be_visible(timeout=30000)
            shot(page, "04-agendamento")
            page.locator('input[type="date"]').first.fill(future.isoformat())
            expect(page.get_by_text(client_name).first).to_be_visible(timeout=30000)

            stage = "venda-pix"
            page.goto(BASE + "/app/pdv", wait_until="domcontentloaded")
            expect(page.get_by_role("heading", name="PDV").first).to_be_visible(timeout=30000)
            catalog = page.locator("section").filter(has=page.get_by_text("Catálogo", exact=True)).first
            expect(catalog.locator("button").first).to_be_visible(timeout=25000)
            catalog.locator("button").first.click()
            page.get_by_role("button", name="Completar").click()
            finish = page.get_by_role("button", name=re.compile("Finalizar venda"))
            expect(finish).to_be_enabled(timeout=12000)
            finish.click()
            expect(page.get_by_text("Venda registrada", exact=True)).to_be_visible(timeout=30000)
            shot(page, "05-venda-pix")

            stage = "csv-vendas-download"
            run_csv_download(page, BASE)

            stage = "caixa"
            page.goto(BASE + "/app/caixa", wait_until="domcontentloaded")
            expect(page.get_by_role("heading", name="Caixa").first).to_be_visible(timeout=30000)
            label = page.get_by_text("Esperado em caixa", exact=True)
            expect(label).to_be_visible(timeout=25000)
            displayed = label.locator("xpath=../..").locator("p").nth(1).inner_text()
            match = re.search(r"R\$\s*([\d.,]+)", displayed)
            if match is None:
                raise AssertionError("Saldo esperado indisponível: " + repr(displayed))
            shot(page, "06-caixa-aberto")
            page.get_by_role("button", name="Fechar caixa").click()
            dialog = page.get_by_role("dialog")
            dialog.locator("input").first.fill(match.group(1))
            dialog.get_by_role("button", name="Confirmar fechamento").click()
            expect(page.get_by_text("Caixa fechado", exact=True)).to_be_visible(timeout=30000)
            shot(page, "07-caixa-fechado")

            stage = "mobile"
            page.set_viewport_size({"width": 390, "height": 844})
            page.goto(BASE + "/app", wait_until="domcontentloaded")
            expect(page.locator("main").first).to_be_visible(timeout=30000)
            shot(page, "08-painel-mobile")
            stage = "cadastro-email-otp"
            email_page = browser.new_page(viewport={"width": 1366, "height": 768}, locale="pt-BR")
            email_page.goto(BASE + "/auth", wait_until="domcontentloaded")
            expect(email_page.locator("#auth-email")).to_be_visible(timeout=30000)
            test_email = "qa-barber-browser@example.test"
            email_page.locator("#auth-email").fill(test_email)
            email_page.get_by_role("button", name="Enviar código").click()
            expect(email_page.get_by_role("heading", name="Confira seu e-mail")).to_be_visible(timeout=40000)
            otp_file = pathlib.Path("/tmp/barber-smoke-otp.json")
            deadline = time.monotonic() + 30
            code = None
            while time.monotonic() < deadline:
                if otp_file.is_file():
                    payload = json.loads(otp_file.read_text())
                    if payload.get("to") == test_email:
                        code = payload.get("otp")
                        break
                time.sleep(0.2)
            if not isinstance(code, str) or len(code) != 6:
                raise AssertionError("Gateway de e-mail local não recebeu o OTP fictício")
            email_page.locator('input[autocomplete="one-time-code"]').fill(code)
            email_page.get_by_role("button", name="Verificar código").click()
            email_page.wait_for_url(re.compile(r"/onboarding(?:[?#].*)?$"), timeout=60000)
            expect(email_page.locator("#ob-name")).to_be_visible(timeout=20000)
            shot(email_page, "09-email-validado")
            stage = "cadastro-barbearia"
            email_page.locator("#ob-name").fill("Barbearia de Homologação E2E")
            email_page.locator("form").filter(has=email_page.locator("#ob-name")).get_by_role("button", name="Criar barbearia").click()
            email_page.wait_for_url(re.compile(r"/app/configuracoes(?:[?#].*)?$"), timeout=45000)
            expect(email_page.get_by_role("heading", name="Configurações").first).to_be_visible(timeout=30000)
            shot(email_page, "10-barbearia-criada")
            stage = "convites-isolados"
            run_barber_invites(browser, email_page, BASE)
            print("BROWSER_SMOKE_PASS - visitante, demo, agenda, venda PIX, caixa, mobile, OTP simulado, cadastro e convites isolados")
            if errors:
                print("Exceções Javascript:", *errors[:8], sep="\n - ")
        except Exception:
            print(f"FALHA na etapa {stage}, URL={page.url}", file=sys.stderr)
            traceback.print_exc()
            if errors:
                print("Erros JS:", *errors[:10], sep="\n - ", file=sys.stderr)
            try:
                shot(email_page if stage.startswith("cadastro-") else page, "falha")
            except Exception:
                pass
            raise
        finally:
            browser.close()

if __name__ == "__main__":
    run()

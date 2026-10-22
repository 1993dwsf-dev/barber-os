"""Smoke test for gated password authentication using a disposable local Convex and fake Resend."""
import json
import pathlib
import re
import time

from playwright.sync_api import expect, sync_playwright

BASE = "http://127.0.0.1:5173"
MAIL_FILE = pathlib.Path("/tmp/barber-smoke-otp.json")
EMAIL = "qa-authv2@example.test"
PASSWORD = "SenhaSeguraTeste2026"
NEW_PASSWORD = "SenhaRenovada2026"

def receive_code(digits=8):
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        if MAIL_FILE.is_file():
            payload = json.loads(MAIL_FILE.read_text())
            otp = payload.get("otp")
            if payload.get("to") == EMAIL and isinstance(otp, str) and len(otp) == digits:
                MAIL_FILE.unlink()
                return otp
        time.sleep(0.25)
    raise AssertionError("Gateway local não recebeu o e-mail esperado")

def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            page = browser.new_page(locale="pt-BR")
            page.goto(BASE + "/auth", wait_until="domcontentloaded")
            expect(page.get_by_role("heading", name="Entre na sua barbearia")).to_be_visible(timeout=30000)
            expect(page.get_by_role("button", name="Entrar com Google")).to_be_visible()
            page.get_by_role("button", name="Criar conta").first.click()
            expect(page.get_by_role("heading", name="Crie sua conta")).to_be_visible()
            page.get_by_label("E-mail").fill(EMAIL)
            page.get_by_label("Senha", exact=True).fill(PASSWORD)
            if MAIL_FILE.exists():
                MAIL_FILE.unlink()
            page.get_by_role("button", name="Criar conta").click()
            expect(page.get_by_role("heading", name="Confirme seu e-mail")).to_be_visible(timeout=45000)
            code = receive_code()
            page.get_by_label("Código de verificação").fill(code)
            page.get_by_role("button", name="Verificar código").click()
            page.wait_for_url(re.compile(r"/onboarding(?:[?#].*)?$"), timeout=60000)
            print("PASS: cadastro por senha com verificação de e-mail", flush=True)

            second = browser.new_page(locale="pt-BR")
            second.goto(BASE + "/auth", wait_until="domcontentloaded")
            second.get_by_label("E-mail").fill(EMAIL)
            second.get_by_label("Senha", exact=True).fill(PASSWORD)
            second.get_by_role("button", name="Entrar", exact=True).click()
            second.wait_for_url(re.compile(r"/onboarding(?:[?#].*)?$"), timeout=60000)
            print("PASS: login por senha", flush=True)

            third = browser.new_page(locale="pt-BR")
            third.goto(BASE + "/auth", wait_until="domcontentloaded")
            third.get_by_role("button", name="Esqueci minha senha").click()
            third.get_by_label("E-mail").fill(EMAIL)
            if MAIL_FILE.exists():
                MAIL_FILE.unlink()
            third.get_by_role("button", name="Enviar código").click()
            expect(third.get_by_role("heading", name="Crie uma nova senha")).to_be_visible(timeout=45000)
            token = receive_code()
            third.get_by_label("Código de verificação").fill(token)
            third.get_by_label("Nova senha").fill(NEW_PASSWORD)
            third.get_by_role("button", name="Salvar nova senha").click()
            third.wait_for_url(re.compile(r"/onboarding(?:[?#].*)?$"), timeout=60000)
            print("PASS: redefinição de senha", flush=True)

            fourth = browser.new_page(locale="pt-BR")
            fourth.goto(BASE + "/auth", wait_until="domcontentloaded")
            fourth.get_by_label("E-mail").fill(EMAIL)
            fourth.get_by_label("Senha", exact=True).fill(NEW_PASSWORD)
            fourth.get_by_role("button", name="Entrar", exact=True).click()
            fourth.wait_for_url(re.compile(r"/onboarding(?:[?#].*)?$"), timeout=60000)
            print("AUTH_V2_SMOKE_PASS", flush=True)
        finally:
            browser.close()

if __name__ == "__main__":
    run()

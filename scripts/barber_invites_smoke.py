"""Valida convites reais na UI, sem credenciais externas: três navegadores isolados.

Executado pelo browser_smoke com Convex descartável, OTP fake e dados fictícios.
Nunca registra no log os códigos de convite ou de autenticação.
"""
import json
import pathlib
import re
import time
from playwright.sync_api import expect

OTP_PATH = pathlib.Path("/tmp/barber-smoke-otp.json")


def _receive_otp(email):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if OTP_PATH.exists():
            record = json.loads(OTP_PATH.read_text())
            if record.get("to") == email and re.fullmatch(r"\d{6}", record.get("otp", "")):
                return record["otp"]
        time.sleep(0.2)
    raise AssertionError("O gateway local não recebeu o OTP de teste")


def _sign_up_staff(browser, base, email, code, check_invalid=False):
    page = browser.new_page(viewport={"width": 1250, "height": 860}, locale="pt-BR")
    page.set_default_timeout(25000)
    page.goto(base + "/auth", wait_until="domcontentloaded")
    expect(page.locator("#auth-email")).to_be_visible(timeout=35000)
    page.locator("#auth-email").fill(email)
    page.get_by_role("button", name="Enviar código").click()
    expect(page.get_by_role("heading", name="Confira seu e-mail")).to_be_visible(timeout=35000)
    page.locator('[autocomplete="one-time-code"]').fill(_receive_otp(email))
    page.get_by_role("button", name="Verificar código").click()
    page.wait_for_url(re.compile(r"/onboarding(?:[?#].*)?$"), timeout=60000)
    page.get_by_role("button", name="Tenho um convite").click()
    expect(page.locator("#ob-code")).to_be_visible(timeout=20000)
    if check_invalid:
        page.locator("#ob-code").fill("INVALIDO1234")
        page.get_by_role("button", name="Entrar na unidade").click()
        expect(page.get_by_text("Código de convite inválido.")).to_be_visible(timeout=20000)
    page.locator("#ob-code").fill(code)
    page.get_by_role("button", name="Entrar na unidade").click()
    page.wait_for_url(re.compile(r"/app/meu-espaco(?:[?#].*)?$"), timeout=60000)
    expect(page.get_by_role("heading", name="Seu acesso foi criado")).to_be_visible(timeout=30000)
    expect(page.get_by_text(code)).to_have_count(0)
    return page


def _create_barber(owner, base, professional):
    owner.goto(base + "/app/equipe", wait_until="domcontentloaded")
    expect(owner.get_by_role("heading", name="Barbeiros").first).to_be_visible(timeout=30000)
    owner.get_by_role("button", name="Novo barbeiro").first.click()
    dialog = owner.get_by_role("dialog")
    expect(dialog.get_by_text("Novo barbeiro")).to_be_visible()
    dialog.locator("input").first.fill(professional)
    dialog.get_by_role("button", name="Cadastrar", exact=True).click()
    expect(owner.get_by_text("Barbeiro salvo")).to_be_visible(timeout=35000)


def _link_barber(owner, base, email, professional):
    owner.goto(base + "/app/configuracoes", wait_until="domcontentloaded")
    owner.get_by_role("tab", name="Equipe").click()
    expect(owner.get_by_text("Equipe e permissões")).to_be_visible(timeout=30000)
    member = owner.locator("li").filter(has_text=email)
    expect(member).to_have_count(1, timeout=30000)
    member.get_by_role("combobox").last.click()
    owner.get_by_role("option", name=professional, exact=True).click()
    expect(owner.get_by_text("Vínculo atualizado")).to_be_visible(timeout=35000)
    expect(member.get_by_text("vinculado a " + professional, exact=False)).to_be_visible(timeout=30000)


def _test_team_member_editing(owner, base):
    """Exercita o novo editor de nomes e os vínculos modificáveis na própria UI."""
    owner.goto(base + "/app/configuracoes", wait_until="domcontentloaded")
    owner.get_by_role("tab", name="Equipe").click()
    myself = owner.locator("li").filter(has_text="qa-barber-browser@example.test")
    expect(myself).to_have_count(1, timeout=30000)
    myself.get_by_role("button", name=re.compile(r"Editar nome")).click()
    dialog = owner.get_by_role("dialog")
    expect(dialog.get_by_role("heading", name="Editar nome na equipe")).to_be_visible()
    dialog.locator("#team-display-name").fill("Titular QA da Equipe")
    dialog.get_by_role("button", name="Salvar nome").click()
    expect(myself.get_by_text("Titular QA da Equipe")).to_be_visible(timeout=30000)
    expect(myself.get_by_text("qa-barber-browser@example.test")).to_be_visible()
    expect(myself.get_by_role("combobox").first).to_be_disabled()
    print("PASS: proprietário altera nome de exibição e mantém papel e e-mail", flush=True)

    member = owner.locator("li").filter(has_text="barbeiro-e2e-a@example.test")
    expect(member).to_have_count(1, timeout=30000)
    member.get_by_role("combobox").last.click()
    owner.get_by_role("option", name="Sem vínculo", exact=True).click()
    expect(owner.get_by_text("Vínculo removido")).to_be_visible(timeout=30000)
    expect(member.get_by_text("vinculado a Profissional A Teste")).to_have_count(0)
    member.get_by_role("combobox").last.click()
    owner.get_by_role("option", name="Profissional A Teste", exact=True).click()
    expect(owner.get_by_text("Vínculo atualizado")).to_be_visible(timeout=30000)
    expect(member.get_by_text("vinculado a Profissional A Teste", exact=False)).to_be_visible(timeout=30000)
    owner.screenshot(path="artifacts/browser-smoke/11-equipe-editada.png", full_page=True)
    print("PASS: vínculo profissional removido e restaurado na UI", flush=True)


def run_barber_invites(browser, owner, base):
    """Entra por convite compartilhado e comprova isolamento de navegação entre contas."""
    stage = "identificar-convite"
    staff_pages = []
    try:
        owner.goto(base + "/app/configuracoes", wait_until="domcontentloaded")
        owner.get_by_role("tab", name="Equipe").click()
        invite_panel = owner.locator("section").filter(
            has=owner.get_by_text("Código de convite", exact=True)
        ).last
        expect(invite_panel).to_be_visible(timeout=30000)
        invite = invite_panel.locator("span").filter(
            has_text=re.compile(r"^[A-Z0-9]{12}$")
        ).first.inner_text().strip()
        if not re.fullmatch(r"[A-Z0-9]{12}", invite):
            raise AssertionError("Código de convite não encontrado na área do proprietário")

        stage = "dois-funcionarios-ingressando"
        staff1 = _sign_up_staff(browser, base, "barbeiro-e2e-a@example.test", invite, check_invalid=True)
        staff_pages.append(staff1)
        staff2 = _sign_up_staff(browser, base, "barbeiro-e2e-b@example.test", invite)
        staff_pages.append(staff2)
        print("PASS: código inválido rejeitado e duas contas ingressaram por código válido", flush=True)

        stage = "vinculo-profissional"
        _create_barber(owner, base, "Profissional A Teste")
        _create_barber(owner, base, "Profissional B Teste")
        _link_barber(owner, base, "barbeiro-e2e-a@example.test", "Profissional A Teste")
        _link_barber(owner, base, "barbeiro-e2e-b@example.test", "Profissional B Teste")

        stage = "editar-equipe"
        _test_team_member_editing(owner, base)

        stage = "area-privada"
        for page, mine, colleague in (
            (staff1, "Profissional A Teste", "Profissional B Teste"),
            (staff2, "Profissional B Teste", "Profissional A Teste"),
        ):
            page.reload(wait_until="domcontentloaded")
            expect(page.get_by_role("heading", name="Meu espaço · " + mine)).to_be_visible(timeout=40000)
            expect(page.get_by_text(colleague, exact=False)).to_have_count(0)
            expect(page.get_by_text(invite)).to_have_count(0)
            expect(page.get_by_text("Minha agenda")).to_be_visible()
            expect(page.get_by_text("Minhas comissões")).to_be_visible()
            for protected_path in ("/app/agenda", "/app/pdv", "/app/configuracoes"):
                page.goto(base + protected_path, wait_until="domcontentloaded")
                page.wait_for_url(re.compile(r"/app/meu-espaco(?:[?#].*)?$"), timeout=30000)
            expect(page.get_by_role("heading", name="Meu espaço · " + mine)).to_be_visible(timeout=20000)
        print("PASS: vínculos individuais, apenas área privada e bloqueio de rotas gerais", flush=True)
    except Exception:
        print("FALHA no teste de convites: " + stage, flush=True)
        for page in staff_pages:
            try:
                page.screenshot(path="artifacts/browser-smoke/falha-convite.png", full_page=True)
                break
            except Exception:
                pass
        raise
    finally:
        for page in staff_pages:
            page.close()

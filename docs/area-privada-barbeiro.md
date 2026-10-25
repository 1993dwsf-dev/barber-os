# Barber OS — Área privada do barbeiro

## Escopo implementado

- Toda sessão com papel `barber` é redirecionada a `/app/meu-espaco`. O cabeçalho simplificado não carrega a busca global nem notificações da unidade.
- A matriz `RBAC.barber` autoriza somente a capacidade `barberPortal`. Endpoints de agenda geral, PDV, clientes, catálogo, comissões gerais, gestão e relatórios negam acesso no servidor.
- `barberPortal.myWorkspace` deriva o profissional somente de `organizationMembers.barberId` da sessão. Retorna apenas sua agenda (últimos 7 a próximos 30 dias, no máximo 180 atendimentos) e suas comissões dos últimos 30 dias (máximo 300 registros coletados).
- Ações possíveis: confirmar (`agendado → confirmado`) ou iniciar (`confirmado → em_atendimento`) **o próprio atendimento**. Não conclui, cobra, edita dados de cliente nem acessa o caixa.
- Sem vínculo profissional: nenhuma informação de atendimentos ou comissões. O proprietário precisa vincular a conta em **Configurações → Equipe → Vincular barbeiro**.
- Código de convite e campos de contato/configuração operacional da unidade são ocultados nas consultas de contexto de usuário com papel barbeiro.
- Notificações da organização não podem ser alteradas por esse papel.

## Fluxo de convite

1. O proprietário copia o código da unidade em `Configurações → Equipe → Código de convite`.
2. O funcionário se autentica com sua conta pessoal e escolhe `Tenho um convite` no onboarding.
3. `orgs.joinByInviteCode` atribui papel `barber` e membro da unidade. Após o login, o funcionário entra em `/app/meu-espaco`.
4. Até o proprietário vincular `barberId`, o painel só mostra a mensagem de ativação. Cada conta vê apenas seus próprios dados após o vínculo.

**O convite atual é compartilhado** (pode ser reutilizado enquanto não for regenerado). Não divulgar em canais públicos. Ainda falta implementar convites pessoais com vencimento e revogação.

## Teste hospedado: restrição

O deployment de homologação existente restringe login a `BARBER_STAGING_EMAIL`. **Não modificar** `BARBER_AUTH_COMMERCIAL_ENABLED`, `BARBER_STAGING_EMAIL` nem abrir o cadastro público para testar múltiplas contas.

Nesta etapa, os testes automatizados de backend criam duas identidades fictícias, executam `joinByInviteCode`, associam profissionais distintos e verificam isolamento via API. Para testar com duas contas reais no navegador, criar posteriormente **outro deployment Convex de QA**, site isolado e autenticação/e-mail configurados especificamente para o teste. Não reutilizar dados de clientes reais.

## Limites

- Dados de clientes existentes no agendamento do próprio profissional incluem apenas nome, serviço, data e horário.
- A visibilidade histórica está limitada a janelas de tempo; não é um extrato permanente.
- Comissões dependem dos lançamentos já existentes e seu vínculo com o profissional.
- Antes de uso comercial real, concluir revisão dos endpoints não padronizados e proteger compartilhamento do código. A homologação não constitui autorização para uso com informações reais de empregados.

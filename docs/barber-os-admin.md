# Barber OS Admin — painel interno v1 (homologação)

## Finalidade

Primeira versão da central **do operador da plataforma**, não do proprietário de uma barbearia.
Rota: `/admin`. Exibe **somente leitura** sobre unidades cadastradas, seu caráter de demonstração e eventual estado de plano/piloto **registrado no banco**. Não exibe cadastro de clientes, faturamento interno, informações pessoais de funcionários, convites comerciais, chaves, nem números de receita do negócio SaaS.

Este **não** é um sistema comercial nem de assinatura. O modelo de `organizationEntitlements` é infraestrutura preparatória e não comprova pagamentos efetuados. A lista é limitada às **75 organizações mais recentes** e os contadores mostram **somente essas 75**, com aviso se houver mais.

## Como habilitar sem abrir o sistema para terceiros

A ativação é **manual**, somente nas **Environment Variables do deployment Convex correto**:

1. Faça login no `https://barber-os.pages.dev` com a conta própria já autorizada na homologação.
2. No **Convex Dashboard → projeto exclusivo de homologação → Data → tabela `users`**, localize o registro correspondente **ao mesmo e-mail de login verificado**. Copie o valor de `_id` dessa conta (não confunda com `authSessions`, `organizationMembers` ou IDs de barbearias).
3. Em **Settings → Environment Variables** do **mesmo deployment Development (Cloud)**, defina:
   - `BARBER_PLATFORM_ADMIN_USER_ID` = o `users._id` copiado;
   - `BARBER_PLATFORM_ADMIN_EMAIL` = o e-mail verificado da mesma conta.
4. **Não** adicione essas variáveis ao Cloudflare Pages, `VITE_*`, arquivos versionados ou `main`. Não compartilhe ID ou e-mail em capturas públicas.
5. Com as funções de `staging` já publicadas no deployment correto via `bunx convex dev --once`, abra `https://barber-os.pages.dev/admin`. Caso já esteja no sistema, há um item **Barber OS Admin** no menu de unidades, visível apenas à conta autorizada.

O controle exige **os dois valores simultaneamente**, sessão real de usuário, e-mail verificado no cadastro (`emailVerificationTime`) e identidade de autenticação que corresponda a `users._id`. Nenhum papel `owner` ou `admin` dentro de uma barbearia concede acesso global. Se qualquer configuração faltar, estiver trocada ou a conta não estiver verificada, o sistema **nega** o acesso. Não existe substituto de autenticação por parâmetro de URL ou variável pública.

**Para revogar**: remova qualquer uma das duas variáveis do Convex. Isso não altera a conta nem suas barbearias, apenas impede as consultas globais. Não reutilize permissões administrativas de unidade para conceder acesso à plataforma.

## O que esta versão faz

- Tela isolada e não dependente de uma barbearia selecionada.
- Lista limitada às 75 unidades mais recentes com nome comercial e data de criação.
- Diferencia unidades demo, teste e sem configuração de plano (somente dados cadastrados).
- Pesquisa e filtros **locais** apenas sobre os itens já recebidos e autorizados.
- Botão de retorno ao sistema e saída de sessão.
- Link de navegação visível apenas para a conta autorizada.
- Backend com consultas apenas de leitura e controle server-side; testes de negação de acesso para contas externas e para ambiente sem configuração.

## O que NÃO faz (não confundir com gestão comercial)

- Criar, editar, suspender ou excluir barbearias/usuários.
- Acessar agendas, clientes, dados financeiros ou contratos de cada unidade.
- Acompanhar receita MRR, cobrança ou pagamentos confirmados: **não existe integração comercial efetiva**.
- Emitir convites externos por UI, gerenciar tickets de suporte ou recuperar backups.
- Monitorar custos reais do Convex, Cloudflare ou Resend: estes permanecem nos painéis técnicos.

## Testes antes de uso real

- [ ] Abrir `/admin` sem variáveis definidas: tela de acesso restrito e nenhum dado global.
- [ ] Configurar ambas as variáveis no ambiente correto: painel abre somente com a conta aprovada.
- [ ] Conta de outra barbearia, mesmo proprietária: acesso negado (testar em QA isolado, sem abrir e-mails da staging).
- [ ] Conferir registros fictícios e compará-los ao Convex; se houver mais de 75, aparece aviso de parcialidade.
- [ ] Repetir tentativa de acesso direto ao backend como conta externa: autorização negada.
- [ ] Revisar a ausência de informações de clientes, equipe, faturamento ou credenciais.

**Não habilitar `BARBER_AUTH_COMMERCIAL_ENABLED=true`, `BARBER_BILLING_ENFORCED=true` nem remover `BARBER_STAGING_EMAIL` na homologação. Não colocar dados reais nesta base e não alterar a `main`.**

Quando chegar a etapa comercial, discutir autenticação administrativa separada, 2FA forte, gestão de incidentes, trilhas de consulta globais, paginação server-side, monitoramento e administração de assinaturas em ambiente novo, com revisão LGPD apropriada.


## Etapa v2 — detalhes operacionais e rascunhos de planos (branch de revisão)

Esta etapa amplia o painel com:
- **Detalhes por barbearia**: nome, status de acesso, plano operacional registrado, origem do acesso, datas de cadastro/atualização e vencimentos. Não inclui dados de clientes, funcionários, contatos privados, códigos de convite nem finanças da unidade.
- **Catálogo comercial em rascunho**: nome, descrição e mensalidade estimada em centavos de real, com criação e edição restritas ao administrador global.
- **Auditoria independente**: registros de criação/edição na tabela `platformAdminAuditLogs`, sem misturar eventos com `auditLogs` das barbearias.
- **Separação explícita**: os rascunhos `platformPlanDrafts` não são os planos internos `membershipPlans` e não alteram `organizationEntitlements`. Não geram pagamentos, cobranças, permissões, suspensão ou ativação.

Limites: até 100 rascunhos; a listagem do catálogo exibe no máximo 100. A lista de barbearias permanece limitada às 75 mais recentes. O preço informado é um valor **planejado**, não uma cobrança ativa. A validação de autorização e de valores ocorre no servidor, independentemente da interface.

### Checklist para revisão antes de integrar à staging

1. Rodar `bun install --frozen-lockfile`, `bun run test:backend`, `bun run build` e `bun run lint` no Codespaces.
2. Conferir que uma conta não autorizada não lê detalhes nem rascunhos e não consegue criar/editar planos.
3. Criar e editar rascunho com conta autorizada; confirmar eventos em `platformAdminAuditLogs`.
4. Verificar que `organizationEntitlements` não sofreu alterações.
5. Somente após aprovação do PR, publicar `bunx convex dev --once` no deployment Development `barber-os-homologacao`, nunca em produção.

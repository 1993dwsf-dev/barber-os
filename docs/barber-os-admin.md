# Barber OS Admin — homologação (v1 leitura, v2 catálogo, v3 pilotos)

## Finalidade

Central **do operador da plataforma**, não do proprietário de uma barbearia. A descrição abaixo registra a versão original (v1); as novas capacidades constam das seções posteriores.
Rota: `/admin`. Exibe **somente leitura** sobre unidades cadastradas, seu caráter de demonstração e eventual estado de plano/piloto **registrado no banco**. Não exibe cadastro de clientes, faturamento interno, informações pessoais de funcionários, convites comerciais, chaves, nem números de receita do negócio SaaS.

A v1 **não** era um sistema comercial nem de assinatura. O modelo de `organizationEntitlements` é infraestrutura preparatória e não comprova pagamentos efetuados. A lista é limitada às **75 organizações mais recentes** e os contadores mostram **somente essas 75**, com aviso se houver mais.

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

## O que a versão 1 faz

- Tela isolada e não dependente de uma barbearia selecionada.
- Lista limitada às 75 unidades mais recentes com nome comercial e data de criação.
- Diferencia unidades demo, teste e sem configuração de plano (somente dados cadastrados).
- Pesquisa e filtros **locais** apenas sobre os itens já recebidos e autorizados.
- Botão de retorno ao sistema e saída de sessão.
- Link de navegação visível apenas para a conta autorizada.
- Backend com consultas apenas de leitura e controle server-side; testes de negação de acesso para contas externas e para ambiente sem configuração.

## O que a versão 1 NÃO faz (histórico)

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

## Etapa v3 — Gestão manual de pilotos e testes (PR em revisão)

Ações no menu de detalhes de uma unidade não-demo:
- **Iniciar teste** quando a unidade ainda não possui `organizationEntitlements`.
- **Prorrogar teste** se o registro atual está em `trialing` e sua origem é `pilot`.
- **Suspender teste** se está em `trialing`, preservando a data registrada.
- **Reativar teste** somente se estiver suspenso e for originado de `pilot`, com novo prazo definido.

**Não é gestão de pagamentos.** Não converte ninguém em assinante pagante, não escreve `status="active"`, não cria cobranças, não permite editar registros `source="billing"` e não habilita o controle comercial automaticamente.

**Barreira extra:** a mutação falha de forma segura por padrão. Para permitir operações exclusivamente no projeto Convex **Development de homologação**, configurar no deployment privado:

```text
BARBER_PLATFORM_TRIAL_ADMIN_WRITES=true
```

Não incluir essa chave em `.env.local` versionado, Cloudflare Pages ou variáveis `VITE_*`. Manter a chave ausente em produção. Para revogar, apagar a variável ou definir `false`. Se `BARBER_BILLING_ENFORCED=true`, as operações manuais são desabilitadas independentemente da flag.

### Proteções técnicas

- A mesma autenticação administrativa reforçada (ID de usuário e e-mail verificado) é exigida novamente **no backend** para cada consulta e mutação.
- Confirmação literal do **nome da unidade**, justificativa de **12 a 350 caracteres** e limite de **1 a 30 dias** por operação.
- Limite superior de 90 dias para a data final do teste contados do momento da operação.
- Verificação otimista por **ID e versão do entitlement** para não sobrescrever modificações concorrentes.
- Bloqueio de unidades em demonstração, de assinaturas `billing` e de operações incompatíveis com o status.
- Cada alteração gera evento em `platformAdminAuditLogs` com estado anterior/posterior e justificativa. A UI consulta os **20 eventos mais recentes** por unidade.
- Nenhuma leitura da tabela `clients`, `sales`, equipe, credenciais ou financeiro da unidade.

### Cuidado: aplicação efetiva do status

A configuração `BARBER_AUTH_COMMERCIAL_ENABLED` ou `BARBER_BILLING_ENFORCED` define se os registros de acesso controlam **escritas** das barbearias. Na homologação atual, esses controles podem estar desligados; nesse caso, **suspender muda o estado no banco, mas não bloqueia edição na unidade**. Não habilitar os controles de acesso comercial apenas para testar a interface v3; planejar validação isolada antes.

### Ordem de implantação

1. Revisar CI completo e não alterar `main`.
2. Na branch do PR, confirmar `CONVEX_DEPLOYMENT=dev:unique-tortoise-387` vinculado ao projeto `barber-os-homologacao`.
3. Rodar `bunx convex dev --once` para publicar **somente nesse deployment Development**, antes de integrar à `staging`. Nunca usar `convex deploy` neste fluxo.
4. Após atualizar o backend, integrar PR à `staging`, permitindo ao Cloudflare publicar o frontend.
5. Validar leitura do painel com a flag desligada (operações indisponíveis).
6. Se for autorizado testar alterações reais em registros fictícios, habilitar `BARBER_PLATFORM_TRIAL_ADMIN_WRITES=true` **no Convex Development** e testar iniciar, prorrogar, suspender e reativar. Conferir eventos em `platformAdminAuditLogs`.
7. Desabilitar a flag depois do teste, se não houver operação administrativa em curso. Revalidar conta não autorizada.

O desenho suporta pilotos. **Suspensão de clientes pagantes, reativação comercial e conexão de cobrança exigem integração específica com o provedor de pagamentos, política contratual e idempotência; não estão incluídas.**

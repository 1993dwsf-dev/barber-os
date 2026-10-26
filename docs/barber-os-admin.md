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


### Ajuste de usabilidade — formulário de gestão de testes

A interface apresenta agora contador da justificativa (mínimo 12, máximo 350 caracteres), aviso contextual quando os campos ainda não autorizam o envio, validação de dias inteiros entre 1 e 30 e histórico com verbos legíveis em português. O botão continua bloqueado até todos os requisitos serem atendidos; a validação real permanece no servidor. Essa alteração é **somente frontend**: não exige um novo deploy do Convex e não altera cobrança, acesso ou dados.


## Etapa v4 — visão de vencimentos e exportação CSV

O painel administrativo passa a apresentar, **somente entre as 75 unidades mais recentes autorizadas**:
- Quantas unidades em `trialing` possuem prazo futuro em até 7 dias;
- Quantos testes têm `trialEndsAt` igual ou anterior ao instante da consulta;
- Filtro por testes próximos do vencimento, já expirados ou sem data de término.

O relatório `barber-os-admin-unidades-AAAA-MM-DD.csv` usa **UTF-8 com BOM**, separador **ponto e vírgula** e datas ISO `AAAA-MM-DD`, para facilitar a abertura no Excel/LibreOffice em pt-BR. O CSV inclui **somente as unidades visíveis após a pesquisa e o filtro**, sempre dentro do limite de 75 registros retornados pela API. Não contém dados pessoais de clientes, equipe, detalhes financeiros, contatos ou credenciais. Nomes de unidade potencialmente interpretáveis como fórmulas são neutralizados.

A classificação de prazo refere-se ao **registro de teste**, não ao status efetivo de cobrança ou ao bloqueio comercial. Um teste pode estar com prazo expirado no banco sem impedir o uso da barbearia quando `BARBER_AUTH_COMMERCIAL_ENABLED` e `BARBER_BILLING_ENFORCED` estão desligados. Um registro `suspended` não é classificado como prazo expirado nos contadores de `trialing`.

O relatório **não é uma exportação total da plataforma**: para mais de 75 unidades será necessária paginação autorizada no backend. Esta etapa **não cria automações de envio de e-mail, notificações externas ou pagamentos**. Como modifica somente o frontend e uma função de formatação, não exige novo comando de deploy Convex.


## Etapa v5 — recepção de eventos Asaas Sandbox (inbox isolada)

**Objetivo:** preparar o caminho para assinaturas comerciais sem movimentar dinheiro e **sem conceder acesso com base somente no webhook**. O adaptador inicial utiliza o **Asaas Sandbox**, que possui credenciais e base independentes da produção.

### Garantias da implementação

- Novo endpoint Convex HTTP: `POST /integrations/asaas/webhook` em **CONVEX_SITE_URL**, não em `VITE_CONVEX_URL`.
- Aceita exclusivamente `application/json`, limita corpo a **64 KiB**, valida formato e somente eventos `PAYMENT_*` explicitamente reconhecidos.
- Antes de ler o corpo, exige `asaas-access-token` igual ao token privado configurado.
- **Desativado por padrão**. Exige `BARBER_ASAAS_WEBHOOK_ENABLED=true`, `BARBER_ASAAS_ENV=sandbox`, `BARBER_BILLING_ENFORCED` diferente de `true` e `CONVEX_CLOUD_URL=https://unique-tortoise-387.convex.cloud`.
- Eventos são deduplicados pelo **ID de evento** dentro de uma mutation transacional.
- Guarda apenas `eventId`, `eventType`, `paymentId`, `subscriptionId` opcional e data de recebimento. Não persiste JSON bruto, valores, CPF, e-mail, telefone ou dados do comprador.
- O Admin exibe os **30 eventos mais recentes**, rotulados **Não conciliado**. O registro de evento não comprova liquidação financeira.
- Nenhuma ligação automática de `paymentId` a uma barbearia, nenhuma criação de assinatura, nenhum MRR e **nenhum update de `organizationEntitlements`**. A cobrança operacional está fora do escopo.
- `401` para token ausente/incorreto, `404` com integração desativada, `400` para payload inválido, `200` para evento reconhecido persistido/duplicado ou não relacionado, e `503` se o banco falhar (reentrega pelo provedor).

### Ativar SOMENTE após criar uma conta de testes

1. Criar conta **separada no** [Asaas Sandbox](https://sandbox.asaas.com/). Não usar API key ou conta de produção.
2. No deployment **Development** `dev:unique-tortoise-387` do Convex, criar variáveis privadas:
   - `BARBER_ASAAS_ENV=sandbox`
   - `BARBER_ASAAS_WEBHOOK_TOKEN=<token aleatório exclusivo de 32 a 255 caracteres, sem espaços>`
   - `BARBER_ASAAS_WEBHOOK_ENABLED=true`
3. No painel Asaas Sandbox, cadastrar webhook de cobrança apontando para **`CONVEX_SITE_URL/integrations/asaas/webhook`** do deployment `unique-tortoise-387`. Configure o campo `authToken` com exatamente o mesmo valor da variável `BARBER_ASAAS_WEBHOOK_TOKEN`. **Não confundir authToken com a API key**.
4. Selecionar eventos de cobrança necessários, disparar um evento fictício de teste e verificar o registro no Admin.
5. Testar reentrega do mesmo evento e confirmar que não cria duplicatas. Testar token inválido e confirmar HTTP 401.
6. Desabilitar após os testes removendo a flag ou definindo `BARBER_ASAAS_WEBHOOK_ENABLED=false`.

**Não inclua os segredos no repositório, Cloudflare Pages ou ChatGPT; configure-os diretamente no dashboard Convex e Asaas.** Nunca rode `bunx convex deploy` com esta integração experimental. A exclusividade do host impede que as funções de webhook sejam habilitadas acidentalmente em outro deployment.

### Pendências antes de cobrar clientes reais

A etapa seguinte requer: vínculo seguro entre conta Asaas, barbearia e plano; criação de cliente/cobrança via API com credenciais do ambiente correto; reconciliação de cobrança consultando o provedor e o vencimento/valor contratados; idempotência no provisionamento; política de renovação, cancelamento, estorno, disputa, inadimplência e prazo de tolerância; garantias de privacidade e termos legais. **Nenhum desses controles é substituído por receber uma notificação `PAYMENT_RECEIVED`.**

Referências oficiais: [Receber eventos](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook), [Idempotência](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks), [Sandbox](https://docs.asaas.com/docs/sandbox).


## Etapa v6 — consulta pontual ao status de uma cobrança no Asaas Sandbox

Após receber um evento na caixa de entrada da v5, o Admin pode consultar o **status atual** dessa cobrança pela API de testes do Asaas, desde que as configurações privadas estejam presentes. O provedor oferece oficialmente a operação `GET https://api-sandbox.asaas.com/v3/payments/{id}/status`.

### Recursos implementados

- Botão **Consultar status** ao lado de cada evento já armazenado na inbox. Não aceita IDs arbitrários fornecidos no formulário.
- Action Convex protegida pela **mesma autenticação global verificada** do Admin, checada no servidor.
- Consulta externa em host fixo `api-sandbox.asaas.com`, com `access_token` enviado somente no servidor.
- Resposta mínima: ID de cobrança, status textual do Asaas, ambiente `sandbox` e horário da consulta.
- Consulta transitória: **não persiste status nem dados de cliente, não altera assinatura, receita ou direito de acesso**.
- Desabilitada por padrão, limitada por flags privadas e pelo URL do Convex Development `unique-tortoise-387`.
- Não utilizar o status externo isolado como autorização comercial: ainda é preciso confirmar vínculo entre cobrança, contrato, valor, período e organização.

### Configuração segura apenas na homologação

Depois de ativar o webhook v5, configure no painel Convex do deployment `unique-tortoise-387`:

```text
BARBER_ASAAS_API_KEY=<chave gerada no Asaas Sandbox, SOMENTE no painel privado Convex>
BARBER_ASAAS_LOOKUP_ENABLED=true
```

A **chave da API** serve exclusivamente para consultar o Asaas e **é diferente** do `BARBER_ASAAS_WEBHOOK_TOKEN`, que autentica os eventos de entrada. Nunca adicionar qualquer uma delas no frontend, Cloudflare Pages, `.env.example` com valor real, repositório ou conversa.

A consulta exige `BARBER_ASAAS_ENV=sandbox`, `BARBER_ASAAS_LOOKUP_ENABLED=true`, `BARBER_BILLING_ENFORCED` diferente de `true`, deployment esperado e API key privada válida.

**Ordem de deploy:** testes CI → Codespaces na branch v6 → confirmar `.env.local` aponta para `dev:unique-tortoise-387` → `bunx convex dev --once` → merge para `staging` → validar botões sem chave (desativados) → configurar variáveis privadas e testar com cobrança fictícia. Nunca publicar na `main` nesta etapa.

Fontes: [Recuperar status de uma cobrança](https://docs.asaas.com/reference/recuperar-status-de-uma-cobranca), [Criar webhook pela aplicação](https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web).

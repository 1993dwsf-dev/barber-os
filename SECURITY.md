# Segurança e operação — BarberFlow OS

Documento curto para quem for manter, auditar ou colocar o sistema em produção.
Descreve **o que já está implementado no código** e **o que ainda depende de
configuração/infra**.

## 1. Modelo de acesso

- Todo dado de negócio carrega `organizationId`. As queries/mutations chamam
  `requireView` / `requireManage` (`src/convex/lib.ts`), que resolvem o usuário
  autenticado (`@convex-dev/auth`), localizam o vínculo em
  `organizationMembers` com índice `by_org_user` e checam a matriz de papéis de
  `src/lib/rbac.ts`.
- Papéis: `owner`, `admin`, `manager`, `barber`, `cashier`, `viewer`. Só
  `owner`/`admin` administram configurações, equipe e ambiente demo.
- Referências cruzadas são validadas com `requireSameOrg`: um ID de cliente,
  barbeiro, serviço, plano, pacote, produto ou agendamento de outra unidade é
  recusado antes de qualquer leitura/escrita derivada. Isso fecha o vazamento de
  nome/telefone entre tenants que existia em `CRM`, lista de espera, vendas e
  fidelidade.
- Storage: `recordFile` grava somente arquivos da própria organização; anexos de
  despesa só aceitam um `storageId` já registrado para a unidade, e
  `getFileUrl` recusa `storageId` que não pertença à organização do chamador.

## 2. Entradas e abuso

- Textos livres passam por `src/convex/validation.ts` (`text`, `requiredText`,
  `textList`) com tetos por campo. Formatos também são validados: `timeLabel`
  (HH:MM), `dateISO` (data de calendário real), `hexColor` (#RRGGBB).
- Expediente de barbeiro (`normalizeSchedule`) exige dias únicos, horários
  válidos e fim depois do início.
- Rate limiting por usuário + ação em `src/convex/rateLimit.ts`, gravado no banco
  com janela deslizante: criar organização, entrar com código de convite
  (força bruta no código de 6 caracteres), gerar convite, gerar URL de upload e
  entrar no modo demo. O contador é liberado quando o convite está correto.
- Dinheiro é sempre tratado em centavos e conferido no servidor: subtotal,
  desconto, crédito de pacote/assinatura e soma dos pagamentos precisam fechar;
  venda em dinheiro exige caixa aberto.

## 3. Auditoria e rastreabilidade

- Ações relevantes gravam em `auditLogs` via `audit()` (quem, quando, módulo,
  tipo e id do registro, resumo). Cobrem organização, equipe, clientes,
  agenda, vendas, PDV, caixa, despesas, estoque/fornecedores, pacotes,
  assinaturas, fidelidade, relacionamento, permissões e **exportação de dados**.
- Alertas internos (`notifications`) sinalizam falta de cliente, divergência de
  caixa, estoque baixo e renovação de assinatura.

## 4. Dados pessoais (LGPD)

- Política de Privacidade em `/privacidade` e Termos de Uso em `/termos`
  (`src/pages/Legal.tsx`), com links no rodapé da landing e na aba **Dados** das
  Configurações.
- Exportação/portabilidade: `backup.exportOrganizationData` gera um JSON com
  todas as tabelas da unidade (limite de 5.000 linhas por tabela, com aviso do
  que foi truncado) e registra a exportação na auditoria. Disponível em
  Configurações → Dados (owner/admin).
- **Pendente de preenchimento pelo responsável:** razão social, CNPJ e e-mail do
  encarregado (DPO) nos textos legais — são placeholders.

## 5. Erros e segredos

- Erros de negócio usam `HttpError` com mensagem curta e sem detalhes internos;
  o envio de código de login nunca serializa o erro HTTP completo (que carrega
  cabeçalhos) — ver `src/convex/auth/emailOtp.ts`.
- O `RootErrorBoundary` só mostra stack trace em desenvolvimento
  (`import.meta.env.DEV`); em produção exibe mensagem genérica e orienta
  recarregar.
- Nenhuma chave é embutida no frontend. O código do Convex lê segredos de
  variáveis de ambiente do deployment (`VLY_INTEGRATION_KEY`,
  `VLY_INTEGRATION_BASE_URL`), gerenciadas pela plataforma — não edite `.env`
  manualmente.

## 6. O que ainda depende de infra/configuração

Estes itens **não** são resolvidos por código deste repositório:

1. **Backups do banco**: usar o recurso de backup/snapshot do provedor (Convex) e
   definir frequência/retensão. A exportação JSON é complementar, não substitui
   backup gerenciado.
2. **Proteção de plataforma**: rate limiting de borda/WAF, alerta de picos e
   bot protection continuam por conta do provedor de hospedagem.
3. **Monitoramento**: configurar alertas para erros de função, latência e falhas
   de envio de código de login (a plataforma expõe logs/métricas; não há
   integração de APM no código).
4. **Rotação de segredos** e revisão periódica de membros com papel de
   owner/admin.
5. **Monitoramento contínuo de dependências**: a varredura foi executada e zerada
   (`bun audit` → 0 · `npm audit --package-lock-only` → 0) e agora roda no CI
   (`.github/workflows/ci.yml`), mas vale habilitar Dependabot/Renovate para
   receber avisos de novas versões.
   Dois `overrides` no `package.json` sustentam isso: `@auth/core ^0.41.3`
   (aviso crítico de normalização de e-mail, usado pelo login) e `ai 5.0.209`
   (a linha nova do AI SDK traz `undici` 5.x/@fastify/busboy vulneráveis; o
   `ai` vem do pacote de integração da plataforma, não é importado pelo app).
   Os dois lockfiles (`bun.lock` e `package-lock.json`) estão sincronizados.
6. **Teste de carga** antes de abrir para muitos usuários: o script está pronto
   (`bun run loadtest`), falta apenas rodar com o volume real.
7. **Verificação de login/render no navegador** após subir dependências de auth:
   pedir código em `/auth` e confirmar que chega e autentica.

## 7. Verificações automatizadas

- `bun test` — testes de `src/convex/validation.ts` (limites/formatos) e da
  matriz de permissões (`src/lib/rbac.ts`).
- `bun convex dev --once && bun tsc -b --noEmit` — codegen e checagem de tipos do
  backend e do frontend.
- `bun audit` — varredura de vulnerabilidades das dependências (deve continuar
  sem achados).
- `bun run check:schema` — garante que toda tabela de unidade declara o índice
  `by_org` (premissa do isolamento por organização e da exportação de dados).
- `bun run loadtest --path <modulo:funcao> --args '<json>'` — teste de carga das
  consultas. Roda só queries por padrão; mutações exigem `--allow-mutation`.
  Precisa de `CONVEX_URL` e do JWT da sessão (`CONVEX_TOKEN`): DevTools →
  Application → Local Storage → `__convexAuthJWT_https://<deployment>.convex.cloud`.
  Sai com código 1 quando a taxa de erro passa de `--max-error-rate` (2%).
- `.github/workflows/ci.yml` — instala, roda `bun audit`, o codegen do Convex
  (quando o secret `CONVEX_DEPLOY_KEY` existe), `tsc`, `check:schema` e testes.

## 8. Operação segura no dia a dia

- Cada pessoa usa a própria conta; nada de compartilhar código de login.
- Convites: o código de 6 caracteres é reutilizável — troque (`Configurações →
  Equipe → Gerar novo`) sempre que sair alguém da equipe.
- Revise a aba **Auditoria** e rebaixe para `viewer` quem só precisa consultar.
- Exporte o backup antes de mudanças grandes (limpeza de dados, migração).

# Barber OS — homologação gratuita sem domínio próprio

Esta implantação é de **teste privado**, não é ambiente comercial. O site usa um endereço grátis `*.pages.dev`, a autenticação usa Convex Auth e o Resend envia OTP de `onboarding@resend.dev` **somente ao e-mail da própria conta Resend**. Sem domínio verificado, outros usuários não conseguirão receber códigos de login.

## 1 — Contas necessárias (gratuitas dentro dos limites dos planos)

- GitHub: repositório `1993dwsf-dev/barber-os`, branch **`staging`** (nunca `main`).
- Cloudflare Pages: https://dash.cloudflare.com
- Convex: https://dashboard.convex.dev
- Resend: https://resend.com

**Não compartilhe chave de API, chave JWT, tokens de deploy ou credenciais neste chat.** Configure tudo diretamente nos painéis.

## 2 — Resend sem domínio verificado

1. Crie uma conta Resend com **o mesmo e-mail pessoal usado para testar o login do Barber OS**.
2. Acesse **API Keys**, crie chave de envio com menor privilégio disponível. Guarde-a somente no painel do Convex.
3. Configure `RESEND_FROM_EMAIL` como `Barber OS <onboarding@resend.dev>`.
4. Configure `BARBER_STAGING_EMAIL` com o endereço exato associado à conta Resend. Essa validação é feita no backend.
5. Não cadastre domínio em **Domains** nesta fase. O remetente de teste **não envia para outros destinatários**; não use para comercialização.

Fonte: https://resend.com/docs e https://resend.com/pricing.

## 3 — Convex separado, hospedado na nuvem

1. Na conta Convex, crie ou selecione um **projeto exclusivo para homologação**; não use dados nem deployments de clientes reais.
2. No Codespaces, sincronize a branch `staging`: `git fetch origin && git switch staging && git pull --ff-only`.
3. Instale dependências: `bun install --frozen-lockfile`.
4. Se o seu Convex estiver ligado ao backend **local**, abra a CLI e selecione um deployment **cloud** desse projeto: `bunx convex dev --configure` e siga a escolha de projeto/deployment hospedado, ou use `bunx convex deployment select dev` quando já houver um deployment cloud vinculado.
5. No painel de **Environment Variables** do deployment cloud, configure:

| Variável privada do Convex | Valor |
| --- | --- |
| `RESEND_API_KEY` | chave criada na sua conta Resend |
| `RESEND_FROM_EMAIL` | `Barber OS <onboarding@resend.dev>` |
| `BARBER_STAGING_EMAIL` | e-mail da sua própria conta Resend |
| `JWT_PRIVATE_KEY` | chave privada Convex Auth, gerada com segurança |
| `JWKS` | conjunto público correspondente à mesma chave |
| `SITE_URL` | URL real do Cloudflare Pages, após sua criação |

6. Gere o par `JWT_PRIVATE_KEY`/`JWKS` **sem exibir nem copiar segredos**, usando o script versionado no projeto. No Codespaces, com o repositório atualizado na branch `staging`, autentique a CLI do Convex na conta correta (por exemplo, `bunx convex login`, se solicitado), e execute:

   ```bash
   node scripts/configure-staging-auth-keys.mjs unique-tortoise-387
   ```

   O script foi restrito ao deployment **Development (Cloud) `unique-tortoise-387`**, verifica os nomes das três variáveis já cadastradas, gera um par RSA de 2048 bits e envia as chaves diretamente para o Convex sem imprimir o conteúdo. Se `JWT_PRIVATE_KEY` e `JWKS` já existirem, não substitui valores. Para gerar manualmente, siga o [guia oficial Convex Auth](https://labs.convex.dev/auth/setup/manual). Nunca use chaves do CI ou exiba os segredos em capturas.
7. Confirme no dashboard de Development (Cloud) que **JWT_PRIVATE_KEY** e **JWKS** aparecem na lista (não abra os valores). Publique então as funções por `bunx convex dev --once` depois de selecionar o deployment cloud correto em `bunx convex dev --configure`. Não execute deploy em Production.
8. Copie **somente a URL pública do Convex cloud** terminada em `.convex.cloud` — ela será usada na próxima etapa. **Nunca use o endereço `http://127.0.0.1:3210` ou `*.convex.site` no frontend.**

A `CONVEX_SITE_URL` é gerada pelo Convex (HTTP Actions); ela não é `SITE_URL`, que deve ser o endereço HTTPS do site no Pages.

## 4 — Cloudflare Pages sem comprar domínio

1. Em Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
2. Autorize o repositório `1993dwsf-dev/barber-os`.
3. Defina a **Production branch = `staging`**. Neste projeto separado de teste, “Production” significa apenas a URL estável de homologação; não é a `main` nem a publicação comercial.
4. Configurações de build:

| Campo | Valor |
| --- | --- |
| Framework | `React (Vite)` / `Vite` |
| Root directory | raiz (`/`) |
| Production branch | `staging` |
| Build command | `bun install --frozen-lockfile && bun run build:pages` |
| Build output directory | `dist` |

5. Configure as **Environment variables de build de produção** do Pages:

| Nome | Valor |
| --- | --- |
| `VITE_CONVEX_URL` | URL HTTPS real do deployment Convex: `https://...convex.cloud` |
| `VITE_STAGING_ONLY` | `true` |
| `NODE_VERSION` | `24.21.0` |
| `BUN_VERSION` | `1.4.3` |

**Nunca configure no Pages:** `RESEND_API_KEY`, `JWT_PRIVATE_KEY`, `JWKS`, `CONVEX_DEPLOY_KEY`, `BARBER_STAGING_EMAIL`. Todas pertencem ao backend Convex.

6. Confirme que a branch está correta e inicie a publicação. A Cloudflare fornecerá um endereço `https://nome-disponivel.pages.dev`; o nome é escolhido lá e ainda não está reservado.
7. Volte às variáveis do Convex e configure `SITE_URL` com esse endereço **exato**, sem barra final.
8. Volte ao site e abra `/auth`: somente o e-mail autorizado deve receber OTP, enquanto o acesso de visitante fica desligado na homologação hospedada.

O script `scripts/check-pages-env.mjs` impede um build sem URL Convex HTTPS correta, sem `VITE_STAGING_ONLY=true`, ou com branch diferente de `staging`. O site pede que robôs não o indexem, **mas isso não é controle de acesso**.

Fontes: https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/ e https://developers.cloudflare.com/pages/configuration/build-image/.

## 5 — Testar e liberar homologação

- [ ] Testar um e-mail enviado pelo Resend à caixa da própria conta e verificar se chegou.
- [ ] Abrir o endereço Pages em desktop e celular (preferencialmente janela anônima).
- [ ] Solicitar OTP com o seu e-mail; entrar; criar uma barbearia com nome fictício.
- [ ] Confirmar que outro e-mail não consegue se cadastrar.
- [ ] Verificar que o botão "Entrar como visitante" não aparece no Pages.
- [ ] Criar agendamento, realizar venda PIX fictícia e fechar caixa.
- [ ] Atualizar direto as rotas `/auth`, `/app` e `/app/agenda` sem erro 404.
- [ ] Confirmar exportação JSON e verificar os campos `counts` e `truncated` conforme a [documentação sobre visualização e futura restauração](relatorios-csv-e-exportacao-json.md#como-visualizar-o-backup-json).
- [ ] Testar controles de permissões, custos dos planos e ausência de credenciais no bundle.
- [ ] **Pendente antes de dados reais:** estabelecer backups recuperáveis, com teste de restauração em QA; o JSON exportado pelo app **não pode ser importado** atualmente. Consulte a [Issue #26](https://github.com/1993dwsf-dev/barber-os/issues/26).

A hospedagem de homologação pode ser acessível a qualquer pessoa que tenha a URL. A restrição de e-mail não equivale a uma plataforma comercial segura, e o endpoint Convex ainda existe publicamente. Não armazene dados pessoais de clientes reais.

## Passagem para produção (etapa futura)

Use domínio próprio/verificado no Resend para enviar a destinatários diferentes. Crie deployment Convex próprio para produção, implemente cobrança recorrente, finalize textos LGPD e faça revisão de segurança. **A `main` não deve ser mesclada ou publicada automaticamente nesta fase.**

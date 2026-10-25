# Barber OS

Sistema SaaS de gestão de barbearias construído em React, Vite, TypeScript, Bun e Convex.

**Estado atual: homologação.** A branch auditada é `audit/p0-financial-security`. A `main` não é a versão revisada, e a plataforma ainda não possui cobrança de assinaturas comerciais.

## Funcionalidades

Agenda e clientes, equipe, serviços, produtos, estoque, PDV, caixa, despesas, relatórios, comissões e fidelidade. O modo visitante permite avaliar a aplicação em organização fictícia.

## Desenvolvimento

1. Instale Node.js 24 e Bun.
2. Execute `bun install --frozen-lockfile`.
3. Execute `bunx convex dev`, escolhendo deployment de desenvolvimento. A CLI gera `.env.local` com `VITE_CONVEX_URL`.
4. Defina as variáveis privadas no **deployment Convex**, conforme [docs/homologacao.md](docs/homologacao.md).
5. Execute `bun run dev`.

O login usa **Convex Auth** com códigos de seis dígitos enviados pela **API Resend**. Um novo login com senha, recuperação de acesso e Google OAuth está sendo desenvolvido atrás de flags desligadas por padrão; veja [docs/autenticacao-v2.md](docs/autenticacao-v2.md). O identificador interno `email-otp` foi mantido. O login não depende do ambiente em que o sistema foi originalmente desenvolvido. Sessões anteriores à migração para Convex Auth precisarão de novo login. O Bun é o gerenciador de dependências oficial do projeto; use `bun install --frozen-lockfile` com o `bun.lock` versionado. O antigo lockfile npm foi removido por estar desatualizado.

## Barber OS Admin (operador da plataforma)

A central de administração global **somente de leitura** fica em `/admin`, separada do painel do proprietário de cada barbearia. O acesso é **bloqueado por padrão**, exigindo uma conta verificada cujo `users._id` e e-mail coincidam com **duas variáveis privadas** no deployment Convex. Não permite ver dados de clientes de outras unidades nem ativar faturamento. Consulte [configuração e testes de acesso](docs/barber-os-admin.md).

## Relatórios, exportação de dados e segurança de backups

- **Relatórios para Excel e similares:** downloads de relatórios em **CSV** (UTF-8, colunas separadas por ponto e vírgula). Veja [Relatórios CSV e exportação JSON](docs/relatorios-csv-e-exportacao-json.md).
- **Exportação técnica em JSON:** acesse **Configurações → Backup → Exportar dados (JSON)**. Para **visualizar**, abra o arquivo no VS Code/Notepad++ ou, no Excel com Power Query, use **Dados → Obter Dados → De Arquivo → De JSON** e expanda `data` → a tabela desejada.
- **Restauração:** **a aplicação ainda NÃO permite importar um arquivo JSON para recuperar os dados**. A exportação limita cada tabela a 5.000 registros (verifique `truncated`) e não inclui o conteúdo binário de anexos. Ela não substitui um backup integral e testado do Convex.
- **Proteção de dados:** o JSON pode conter informações pessoais e financeiras. Guarde-o em local protegido, não o envie para conversores online desconhecidos e não tente inseri-lo diretamente no banco. O procedimento de restauração segura está pendente na [Issue #26](https://github.com/1993dwsf-dev/barber-os/issues/26).

**Documentação completa:** [Como visualizar o backup JSON e como restaurar os dados no futuro](docs/relatorios-csv-e-exportacao-json.md#como-visualizar-o-backup-json).

## Testes

```bash
bun test
bun run test:backend
bun run lint
bunx tsc -b --pretty false
bun audit
bun run build
```

O GitHub Actions executa essas verificações. A automação **Browser smoke** inicia Vite, Convex local, Chromium e **um simulador local de API Resend** para testar login de visitante, login por OTP, criação de barbearia, agenda, PDV, caixa e responsividade. Isso não comprova a entrega real de e-mails.

## Homologação e publicação

Esta versão na branch `staging` foi preparada para **Cloudflare Pages gratuito + `onboarding@resend.dev`**. Ela só admite login com o e-mail autorizado no deployment Convex, e a sessão de visitante fica desabilitada em deployments hospedados.

Configure **Production branch: `staging`**, build `bun install --frozen-lockfile && bun run build:pages`, output `dist`, `VITE_STAGING_ONLY=true` e a URL HTTPS `VITE_CONVEX_URL`. Antes de publicar, leia [docs/homologacao.md](docs/homologacao.md) para configurar Convex + Resend e suas credenciais de forma segura.

**Segurança:** nunca commit `.env.local`, `RESEND_API_KEY`, `JWT_PRIVATE_KEY` ou credenciais de implantação. `VITE_CONVEX_URL` é pública. A publicação e a operação comercial exigem validação de entrega real do e-mail, LGPD, backup, custos e cobrança recorrente.

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

O login usa **Convex Auth** com códigos de seis dígitos enviados pela **API Resend**. O identificador interno `email-otp` foi mantido. O login não depende do ambiente em que o sistema foi originalmente desenvolvido. Sessões anteriores à migração para Convex Auth precisarão de novo login. Dependências legadas ainda presentes nos lockfiles serão revisadas em uma limpeza separada, com regeneração e validação dos arquivos de dependências.

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

# Barber OS

Sistema SaaS de gestão de barbearias construído em React, Vite, TypeScript, Bun e Convex.

**Estado atual: homologação.** A branch auditada é \`audit/p0-financial-security\`. A \`main\` não é a versão revisada, e a plataforma ainda não possui cobrança de assinaturas comerciais.

## Funcionalidades

Agenda e clientes, equipe, serviços, produtos, estoque, PDV, caixa, despesas, relatórios, comissões e fidelidade. O modo visitante permite avaliar a aplicação em organização fictícia.

## Desenvolvimento

1. Instale Node.js 24 e Bun.
2. Execute \`bun install --frozen-lockfile\`.
3. Execute \`bunx convex dev\`, escolhendo deployment de desenvolvimento. A CLI gera \`.env.local\` com \`VITE_CONVEX_URL\`.
4. Defina as variáveis privadas no **deployment Convex**, conforme [docs/homologacao.md](docs/homologacao.md).
5. Execute \`bun run dev\`.

O login usa **Convex Auth** com códigos de seis dígitos enviados pela **API Resend**. O identificador interno \`email-otp\` foi mantido. A autenticação federada de Freebuff/Vly e o toolbar foram desligados. Sessões antigas originadas desse emissor precisarão de novo login. Algumas dependências históricas ainda podem constar do lockfile até uma limpeza de dependências separada.

## Testes

\`\`\`bash
bun test
bun run test:backend
bun run lint
bunx tsc -b --pretty false
bun audit
bun run build
\`\`\`

O GitHub Actions executa essas verificações. A automação **Browser smoke** inicia Vite, Convex local, Chromium e **um simulador local de API Resend** para testar login de visitante, login por OTP, criação de barbearia, agenda, PDV, caixa e responsividade. Isso não comprova a entrega real de e-mails.

## Homologação e publicação

Consulte [docs/homologacao.md](docs/homologacao.md) para configurar **Convex + Resend + Cloudflare Pages** sem armazenar credenciais no código.

**Segurança:** nunca commit \`.env.local\`, \`RESEND_API_KEY\`, \`JWT_PRIVATE_KEY\` ou credenciais de implantação. \`VITE_CONVEX_URL\` é pública. A publicação e a operação comercial exigem validação de entrega real do e-mail, LGPD, backup, custos e cobrança recorrente.

# Homologação do Barber OS

Esta fase prepara o app para uso com Convex, Resend e Cloudflare Pages. **Ainda não foi publicado neste projeto.** Testes de navegador utilizam dados fictícios e envio de e-mail simulado.

## Configuração do Convex

1. Conecte um projeto e deployment de **desenvolvimento separado de produção** em https://dashboard.convex.dev.
2. Na branch auditada execute `bun install --frozen-lockfile` e `bunx convex dev` para gerar os tipos e o arquivo local ignorado pelo Git.
3. Na área de ambiente do deployment, configure as chaves de assinatura e conjunto público de chaves conforme https://labs.convex.dev/auth/setup. Não compartilhe essas chaves na conversa nem as publique no frontend.
4. Configure a variável `SITE_URL` com a URL HTTPS que será fornecida pelo Pages. A URL `CONVEX_SITE_URL` é fornecida pelo Convex e não é a URL do seu frontend.

## E-mail com Resend

1. Crie uma conta em https://resend.com.
2. Verifique um domínio próprio como remetente seguindo as instruções de DNS do serviço. O domínio gratuito do Pages não concede automaticamente permissão de envio.
3. No deployment Convex, configure `RESEND_API_KEY` e `RESEND_FROM_EMAIL`. O remetente deve pertencer ao domínio verificado, por exemplo: `Barber OS <acesso@seu-dominio.com.br>`.
4. Não configure a variável opcional `RESEND_API_URL` em deployments publicados. Ela existe apenas para simular o envio em teste automatizado local.
5. Use um e-mail real de teste para receber, verificar OTP e confirmar a criação de uma nova unidade. Os testes automatizados não comprovam entrega real de mensagens.

O Resend anuncia plano grátis de 3.000 e-mails mensais e até 100 por dia: https://resend.com/pricing.

## Publicação do frontend (Cloudflare Pages)

1. Em https://dash.cloudflare.com abra Workers & Pages → Create → Pages e conecte o GitHub.
2. Use uma branch de **homologação auditada**, não a `main` anterior. Só publique a branch após passar as verificações de CI.
3. Framework Vite, raiz do repositório, comando `bun install --frozen-lockfile && bun run build`, diretório `dist`. Confirme que Bun está disponível no ambiente de build.
4. Configure no Pages somente `VITE_CONVEX_URL` (URL HTTPS do seu deployment de homologação, com final `convex.cloud`). Não exponha chaves ou tokens privados como variáveis VITE.
5. Depois que o Pages gerar uma URL HTTPS, configure-a como `SITE_URL` no Convex correspondente.
6. O Cloudflare Pages atende rotas de uma SPA React automaticamente se não houver um arquivo `404.html` na raiz. Não crie uma regra genérica de reescrita que também atinja os arquivos JS/CSS.
7. A URL pode ficar pública. Não cadastre dados reais enquanto a homologação não tiver autorização, isolamento e revisão LGPD.

## Critérios de aprovação

- [ ] Login com envio real de OTP, código incorreto/expirado, logout e novo login
- [ ] Cadastro da barbearia e vinculação da equipe
- [ ] Agenda, PDV, caixa e relatórios coerentes com dados fictícios
- [ ] Links diretos e recarga de /auth e /app/agenda funcionando
- [ ] Testes desktop e smartphone aprovados
- [ ] Nenhuma chave privada publicada em GitHub, Pages ou bundle
- [ ] Regras LGPD, restauração de backup e monitoramento de falhas revisados
- [ ] Gestão comercial de assinaturas SaaS implementada antes da cobrança

**Migração:** a retirada do emissor federado Freebuff invalida sessões antigas originadas desse serviço. Usuários afetados precisam fazer novo login por OTP do Convex Auth.

Referências: https://docs.convex.dev/auth/convex-auth, https://docs.convex.dev/production/environment-variables e https://developers.cloudflare.com/pages/configuration/serving-pages/.

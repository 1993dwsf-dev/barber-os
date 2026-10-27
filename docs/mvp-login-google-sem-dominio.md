# Barber OS MVP — login somente Google sem comprar domínio

**Objetivo:** convidar 1–2 proprietários e validar agenda, clientes, serviços, venda e caixa. **Não** ativar Asaas automático, não criar novas funcionalidades e não migrar a homologação atual para produção.

## O que já existe no código

- Google OAuth com checagem `email_verified === true`, e-mail normalizado, login e retorno ao app.
- Modo de piloto privado `VITE_MVP_GOOGLE_ONLY=true` oculta senha, OTP, recuperação por e-mail e visitante da interface.
- **Proteção no backend:** `BARBER_MVP_GOOGLE_ONLY=true` registra somente o provedor Google; não confundir ocultar botões com restringir login.
- `BARBER_AUTH_COMMERCIAL_ENABLED=true` permite login Google de outros e-mails **somente no deployment isolado**. Criar barbearia ainda exige token comercial **de uso único, vinculado ao e-mail verificado, com validade de 7 dias**. Sem token, a sessão não cria tenant.
- O botão de convite de **equipe** é outro recurso e não substitui o convite comercial.
- Os métodos anteriores ficam intactos quando as flags novas estão ausentes.

## Caminho mínimo de implantação (novo ambiente, não o Sandbox existente)

1. Criar **novo projeto/deployment Convex de produção para o piloto**, vazio, sem copiar dados do Development `unique-tortoise-387`. Configurar JWT_PRIVATE_KEY/JWKS exclusivos, SITE_URL para o novo endereço público e demais segredos necessários. Seguir o guia do Convex Auth. Não rodar a configuração de chaves exclusiva do sandbox nesse deployment.
2. Criar **novo projeto Cloudflare Pages gratuito** ligado ao mesmo repositório GitHub, branch `staging`, URL própria `*.pages.dev`. O pipeline da branch está preparado para `bun install --frozen-lockfile && bun run build:pages`, output `dist`. Usar `VITE_STAGING_ONLY=true` por exigência do script de build, `VITE_CONVEX_URL=https://<novo-deployment>.convex.cloud`, `VITE_AUTH_V2_ENABLED=true`, `VITE_GOOGLE_AUTH_ENABLED=true` e `VITE_MVP_GOOGLE_ONLY=true`. **Nunca** usar a URL Convex Development na instância com clientes.
3. No **Google Cloud Console**, criar/configurar consentimento OAuth externo em modo Teste, cadastrar as contas Google dos proprietários como usuários de teste e usar o novo domínio Pages em **Authorized JavaScript origins**. Criar cliente OAuth tipo **Web application** e adicionar redirect do **novo** Convex `https://<deployment>.convex.site/api/auth/callback/google`. Não usar o domínio `.convex.cloud` como callback.
4. Nas variáveis **privadas do novo Convex**, adicionar `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`, depois `BARBER_GOOGLE_AUTH_ENABLED=true`, `BARBER_MVP_GOOGLE_ONLY=true` e `BARBER_AUTH_COMMERCIAL_ENABLED=true`. Não ativar `BARBER_ASAAS_ORDER_WRITES`, `BARBER_BILLING_ENFORCED`, `BARBER_ASAAS_WEBHOOK_ENABLED`, nem herdar segredos do Asaas Sandbox. Publicar as funções do projeto **correto** após confirmar o nome do deployment. Não enviar segredos por chat ou commits.
5. Para cada cliente piloto, emitir um convite comercial com `orgs.issuePilotInvite` no **novo deployment** por um operador autorizado via ferramenta administrativa/CLI segura; guardá-lo somente pelo tempo necessário para entrega individual ao titular. **Esta função é interna** e não deve ser exposta diretamente ao browser. Proprietário visita o novo endereço Pages, entra com Google, cola o convite na tela **Criar barbearia**, e recebe o trial controlado.
6. Só carregar **dados pessoais reais** após completar termos e política com o prestador de serviço identificado, o aceite auditável e backup com restauração testada no novo deployment. Até lá fazer demonstrações com dados fictícios.

## Testes GO / NO-GO

- [ ] Ao abrir `/auth` o cliente vê apenas **Entrar com Google**, e não consegue chamar OTP, senha ou visitante no backend de piloto.
- [ ] Usuário Google autorizado consegue entrar; sem conta Google não há login alternativo.
- [ ] Tentativa de criar barbearia sem convite é negada no servidor.
- [ ] Token de outra pessoa ou já usado é negado; token correto e e-mail verificado criam apenas uma unidade e o trial.
- [ ] Segunda barbearia não acessa clientes/agenda/caixa da primeira.
- [ ] Opera agenda, cadastro, venda e caixa em celular; dados permanecem após logout/limpar cache.
- [ ] Termos e privacidade finais disponíveis, aceite registrado; restauração de backup testada.
- [ ] Suporte, procedimento de cancelamento, valor/periodicidade da cobrança Pix manual documentados.
- [ ] Homologação `barber-os.pages.dev` e Convex Development continuam isolados e não contêm dados de clientes reais.

## Importante para segurança e prazo

**Google OAuth elimina a necessidade de um domínio próprio só para os códigos de acesso do MVP.** Ele não resolve sozinho LGPD, backup, cobrança ou entrega de e-mails transacionais em outros fluxos.

Caso o usuário que entrou por Google fique impedido de criar organização com a mensagem “confirme seu e-mail”, verificar se no novo deployment o registro `users.emailVerificationTime` é definido pelo Convex Auth a partir de `emailVerified: true`. Não contornar essa verificação; corrigir a integração antes de expor a clientes.

**Critério comercial:** primeira demonstração pode ocorrer hoje em ambiente fictício; ativação de uso com dados reais depende apenas dos P0, não de todo o sistema Asaas.

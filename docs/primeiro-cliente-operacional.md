# Barber OS — liberação OPERACIONAL do primeiro cliente

## Objetivo (MVP, um cliente)

O prospect recebe a demo pública `https://barber-os-piloto.pages.dev/demo` antes da venda.
**Só depois de o pagamento ter sido combinado diretamente com o proprietário da plataforma**, um único estabelecimento recebe acesso à aplicação real, com credenciais próprias, cadastro de barbearia, dados persistidos no Convex Production e operação de agenda, clientes, serviços, estoque, PDV, caixa e relatórios.

NÃO integrar pagamentos das assinaturas (checkout, webhooks, Pix, planos) ao app. PDV/Caixa **da própria barbearia** são módulos operacionais, não cobrança do SaaS.

## Estado técnico, antes de liberar dados reais

- Convex do cliente: projeto **barber-os-producao**, deployment **Production / clever-squid-863**. NÃO utilizar `unique-tortoise-387`, que é homologação.
- Frontend do cliente: **novo projeto** gratuito Cloudflare Pages, ligado à branch `production`, sem compartilhamento das variáveis da homologação. URL `https://<nome-do-novo-projeto>.pages.dev`; não usar `barber-os.pages.dev` nem `barber-os-piloto.pages.dev`.
- A branch `production` deve ser criada da `staging` aprovada, mas **não deve ser publicada automaticamente até configurar todos os pré-requisitos**. Branch `main` permanece intacta.
- O app exige convite comercial validado no backend e e-mail verificado para criar uma organização. A opção interna de demonstração não é oferecida no onboarding de produção.
- O convite operacional NÃO é um trial. Ele cria entitlement `active` com data de expiração de acesso definida manualmente (padrão: 365 dias; 30–366). Nenhum lançamento financeiro ou confirmação automática de pagamento é criado.
- O backend impede outro convite *operacional* quando uma barbearia já existe no deployment; adicionalmente, o controle de emissão é restrito ao painel de funções internas. Não habilitar cadastro aberto de tenants.

## Pré-requisitos de configuração — SEM segredos no GitHub/ChatGPT

### Convex Production / clever-squid-863

Em **Settings → Environment Variables**, definir no deployment de PRODUCTION, não no Development:

| Variável privada | Valor ou responsabilidade |
| --- | --- |
| `BARBER_AUTH_V2_ENABLED` | `true` — login e senha |
| `BARBER_AUTH_COMMERCIAL_ENABLED` | `true` — apenas após confirmar e-mail e demais gates |
| `BARBER_BILLING_ENFORCED` | `false` — não cobrar assinatura no sistema |
| `BARBER_GOOGLE_AUTH_ENABLED` | `false` |
| `BARBER_MVP_GOOGLE_ONLY` | `false` |
| `BARBER_EMAIL_PROVIDER` | `brevo` |
| `BREVO_FROM_EMAIL` | endereço do remetente aprovado no Brevo (sem expor aqui) |
| `BREVO_API_KEY` | chave restrita do Brevo, **somente no Convex** |
| `SITE_URL` | endereço HTTPS do NOVO Cloudflare Pages comercial |
| `JWT_PRIVATE_KEY` e `JWKS` | gerar CHAVES EXCLUSIVAS para production seguindo Convex Auth, sem reutilizar homologação |

O cliente real não pode ser convidado antes de confirmar entrega de OTP, confirmação e reset em duas caixas externas autorizadas, bem como LGPD/termos e backup restaurável.

### Cloudflare Pages do primeiro cliente

- Fonte: GitHub `1993dwsf-dev/barber-os`, branch `production`.
- Build command: `bun run build:pages`; output directory `dist`.
- Setar variáveis de BUILD (públicas, nunca API keys):

| Variável | Valor |
| --- | --- |
| `VITE_CONVEX_URL` | `https://clever-squid-863.convex.cloud` |
| `VITE_STAGING_ONLY` | `false` |
| `VITE_PRODUCTION_ENABLED` | `true` |
| `VITE_AUTH_V2_ENABLED` | `true` |
| `VITE_GOOGLE_AUTH_ENABLED` | `false` |
| `VITE_MVP_GOOGLE_ONLY` | `false` |

**Não colocar BREVO_API_KEY, JWT_PRIVATE_KEY, JWKS ou CONVEX_DEPLOY_KEY em variáveis VITE_*.**

### Publicação do backend

Usar uma chave de deploy **restrita ao deployment Production correto** ou um terminal autenticado no projeto `barber-os-producao`; executar `bunx convex deploy --prod` conforme a configuração da versão atual do CLI. Nunca usar token ou comando de staging/dev. Validar que o target é `clever-squid-863` **antes** de qualquer deploy. Não copiar as tabelas de demonstração para produção.

## Teste de liberação (antes de entregar ao proprietário)

1. Testar criação de conta e recuperação de senha em duas caixas de QA, confirmando entrega via Brevo, remetente exibido e ausência de bloqueios. Em produção, testes de QA com entidades fictícias devem ser removidos antes do cliente real, ou feitos em deployment descartável separado.
2. Com `BARBER_AUTH_COMMERCIAL_ENABLED=true`, verificar: cadastro sem convite NÃO cria barbearia; convite de outro e-mail NÃO funciona; replay do mesmo convite NÃO funciona.
3. Em QA descartável, simular um convite operacional com identidade verificada e conferir `status=active`, prazo de acesso válido, agendamento, venda fictícia via PDV, baixa de estoque e persistência após recarregar. Não realizar essas ações com cliente real antes de autorização.
4. Validar exportação, backup e capacidade de restauração em backend separado; conferir papéis proprietário/barbeiro, acesso pelo celular, HTTPS e rotas após refresh.
5. Revisar dados do fornecedor para termos e política de privacidade/LGPD e coletar aceite versionado antes dos dados pessoais do cliente.

## Ativação do primeiro cliente (somente quando houver contratação e e-mail)

No **Convex Production → Functions**, executar internamente **`orgs:issueOperationalInvite`**, usando argumentos com e-mail exato (caixa confirmada) e prazo autorizado. Exemplo com valores fictícios:

```json
{"email":"dono@example.com","accessDays":365}
```

A função interna só roda no dashboard/admin CLI autorizado; o token de 64 caracteres é de uso único e vence em sete dias. Não divulgá-lo publicamente nem em URL.

O cliente recebe **(a)** URL do novo app comercial e **(b)** código de ativação por canal privado. Ele:
1. Abre `/auth`, escolhe Criar conta, registra e-mail e senha e verifica o código enviado por e-mail.
2. Entra em `/onboarding`, preenche nome/telefone/endereço e cola o código de ativação.
3. É direcionado para Configurações e conclui catálogo, horários e profissionais, sem exemplos fictícios.
4. Reabre o link e verifica que seus dados continuam lá. Todas as informações operacionais ficam no Convex Production.

**Critério final:** não entregar o link comercial antes de login, convite e persistência validados. A demo pública já pode ser mostrada antes da venda.

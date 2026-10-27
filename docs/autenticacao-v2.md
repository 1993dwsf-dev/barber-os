# Barber OS — autenticação v2 (experimental)

Nova autenticação protegida por flags, sem alterar a homologação atual por OTP. Não publicar para clientes até concluir os testes de migração e segurança.

## Métodos

- E-mail e senha, com exigência de 10 a 128 caracteres (letras e números) e verificação do e-mail por código de oito dígitos enviado pelo Resend.
- Recuperação de senha com código de oito dígitos válido por quinze minutos.
- Google OAuth com e-mail verificado e credenciais do projeto Google Cloud.
- OTP anterior de seis dígitos continua disponível para o proprietário durante a migração.

## Flags do backend Convex — somente nesse deployment

- BARBER_AUTH_V2_ENABLED=true habilita Password; padrão desligado.
- BARBER_GOOGLE_AUTH_ENABLED=true habilita Google se AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET estiverem configuradas; padrão desligado.
- BARBER_STAGING_EMAIL deve permanecer com o endereço autorizado para testes; o backend recusa outros e-mails durante a homologação.
- BARBER_AUTH_COMMERCIAL_ENABLED deve permanecer desligado. Definir true abre acesso a outros e-mails e não significa autorização de produção.
- RESEND_API_KEY, RESEND_FROM_EMAIL, SITE_URL, JWKS e JWT_PRIVATE_KEY permanecem como já configurados. Nunca envie valores privados neste chat ou os inclua no GitHub/Cloudflare Pages.

## Flags públicas no Cloudflare Pages

- VITE_AUTH_V2_ENABLED=true mostra a nova tela.
- VITE_GOOGLE_AUTH_ENABLED=true mostra o botão Google (somente depois de configurar o OAuth no backend).
- VITE_STAGING_ONLY=true e VITE_CONVEX_URL seguem como na homologação.

## Configurar Google OAuth

1. Abra https://console.cloud.google.com/auth/overview e crie ou selecione um projeto.
2. Configure o consentimento OAuth (público externo) e adicione apenas o e-mail autorizado como usuário de teste.
3. Crie um OAuth Client ID do tipo Web application.
4. Authorized JavaScript origins: https://barber-os.pages.dev (e cada outra origem real usada para teste).
5. Authorized redirect URI: URL de HTTP Actions do deployment Convex, com domínio .convex.site, seguida de /api/auth/callback/google. Exemplo ilustrativo: https://exemplo.convex.site/api/auth/callback/google.
6. Guarde AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET apenas nas Environment Variables do Convex de desenvolvimento. Nunca use chaves em variáveis VITE_*.
7. Confirme SITE_URL como o endereço HTTPS do Pages, e então habilite as flags do backend e, por último, as flags públicas.

Guia oficial: https://labs.convex.dev/auth/config/oauth/google

## Teste fechado de múltiplos funcionários no deployment original

**Somente na homologação `dev:unique-tortoise-387`, com contas fictícias.**
O proprietário continua entrando com OTP no endereço `BARBER_STAGING_EMAIL`; **não apague nem substitua esta variável** e não migre a conta existente para o Google sem testar vinculação de identidade.

1. Na aba **Development (Cloud) → Environment Variables** do projeto Convex original, mantenha `BARBER_AUTH_COMMERCIAL_ENABLED` ausente ou `false`, e `BARBER_MVP_GOOGLE_ONLY` ausente ou `false`. Ative `BARBER_AUTH_V2_ENABLED=true` e `BARBER_GOOGLE_AUTH_ENABLED=true` somente depois de cadastrar `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` neste mesmo deployment. Não exponha as credenciais.
2. Configure **somente no Convex original** `BARBER_STAGING_GOOGLE_EMAILS` com **até 10 e-mails Google de teste separados por vírgulas**, sem incluir o e-mail do proprietário (já autorizado em `BARBER_STAGING_EMAIL`). O backend confere e-mail verificado no Google e a correspondência exata da allowlist, inclusive no callback. Sem a variável, continua funcionando a política anterior de um e-mail. **Não habilitar `BARBER_AUTH_COMMERCIAL_ENABLED=true` na homologação.**
3. No Google Cloud Console, mantenha o Client OAuth Web Application e **Authorized JavaScript origins** `https://barber-os.pages.dev`; confira **Authorized redirect URI** `https://unique-tortoise-387.convex.site/api/auth/callback/google` (deve coincidir com o HTTP Actions URL real visto no Convex). Na tela de consentimento externa em Testing, adicione os mesmos endereços em **Test users**.
4. No projeto Cloudflare Pages **original** `barber-os` (não `barber-os-piloto`), na área de **Production environment variables**, mantenha `VITE_CONVEX_URL=https://unique-tortoise-387.convex.cloud`, `VITE_STAGING_ONLY=true`; habilite `VITE_AUTH_V2_ENABLED=true` e `VITE_GOOGLE_AUTH_ENABLED=true`, mantendo `VITE_MVP_GOOGLE_ONLY` ausente ou `false`. Atualize/republique Pages para incorporar flags Vite; variáveis `VITE_*` são públicas e **jamais contêm segredos**.
5. Na branch `staging`, com `.env.local` apontando para `dev:unique-tortoise-387`, execute `bunx convex dev --once` **apenas após validar as variáveis**. Não usar `bunx convex deploy`, `--prod` nem trocar o projeto.
6. O proprietário entra **primeiro com OTP original** e confirma acesso à unidade. Abre **Configurações → Equipe → Código de convite** e fornece o código ao profissional fictício. O funcionário entra no mesmo endereço por **Google**, seleciona **Tenho um convite** e usa o código de equipe (4–12 caracteres). O proprietário deve associar o membro ao seu **cadastro de barbeiro** para habilitar o portal individual. Teste outro funcionário com perfil **Caixa**, acesso independente, bloqueio de funções administrativas, e remoção de um usuário fictício.
7. Verifique que a remoção também **renova automaticamente o código da equipe**, rejeita o anterior e preserva o acesso dos membros ativos. O funcionário extra não pode **criar barbearia própria** na homologação: deve usar **Tenho um convite**. Sem vínculo profissional, o barbeiro vê portal não vinculado.
8. Volte à conta do proprietário com OTP, confira integridade dos dados fictícios e registre resultados. **Não utilizar clientes reais** até passar por LGPD, backup restaurável e liberação comercial isolada.

**Limitações deliberadas:** o Resend `@resend.dev` continua enviando códigos apenas ao e-mail autorizado; funcionários extras usam **Google**, não OTP/senha. Google/Convex Auth pode criar identidade distinta se alguém mudar de provedor; nunca testar troca do método de login da conta do proprietário com dados preexistentes. As flags de frontend devem ser testadas no Pages original antes do acesso dos funcionários.

## Migração segura do proprietário

1. Antes de testes em dados existentes, confira no dashboard Convex o ID do usuário e o ownerId da organização. Não copie nem envie tokens ou segredos.
2. Confirme que o acesso OTP antigo continua abrindo a organização certa.
3. Num ambiente de teste isolado, crie a senha com o MESMO e-mail, confirme o código de verificação e confirme o mesmo ID de usuário e acesso à organização original.
4. Teste logout/login por senha, recuperação de senha, acesso por Google, bloqueio de outro e-mail e isolamento entre barbearias.
5. Se o fluxo criar outra conta ou outro onboarding, interrompa a migração: não associe dados manualmente sem plano específico de vinculação de identidade.
6. Para venda comercial, também é necessário configurar domínio remetente verificado no Resend, ambiente Convex de produção separado, limites por usuário/conta, recuperação de conta e revisão de segurança.

Guia oficial: https://labs.convex.dev/auth/config/passwords


## Preparação do envio comercial (não ativar na homologação)

O envio transacional usa a mesma política do backend para códigos OTP, verificação de e-mail e recuperação de senha. Com `BARBER_AUTH_COMMERCIAL_ENABLED=false`, permanece a restrição ao endereço `BARBER_STAGING_EMAIL`. Com a flag comercial explicitamente ativada em **outro deployment**, o backend somente tenta enviar para novos destinatários se `RESEND_FROM_EMAIL` estiver preenchido e não utilizar remetente `@resend.dev`.

A checagem de endereço **não garante** que o domínio tenha sido verificado: configurar DNS e testar entregabilidade no painel Resend é obrigatório antes de oferecer acesso a clientes. A flag comercial não deve ser ligada antes da implantação de cobrança, gestão de assinaturas, backup e revisão legal.

Veja `docs/prontidao-comercial.md` para os demais bloqueadores de lançamento.

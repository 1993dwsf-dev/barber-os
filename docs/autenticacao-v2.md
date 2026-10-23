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

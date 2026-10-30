# Bootstrap das variáveis — Convex Production (primeiro cliente)

Fluxo manual no GitHub Actions: configure-convex-first-client.yml. Usa o secret
CONVEX_FIRST_CLIENT_DEPLOY_KEY no environment convex-primeiro-cliente e recusa
outra implantação além de prod:clever-squid-863.

Preenche quando ausentes: SITE_URL, login por senha habilitado, Google desabilitado,
comercial e billing desabilitados. Gera par JWT_PRIVATE_KEY e JWKS somente quando
ambos estão ausentes, nunca revela segredos e não rotaciona chaves. Não inventa
chaves Brevo ou Resend. Não cria contas, convites ou dados.

Se falhar por permissão, o deploy key pode ter somente deployment:deploy; é
necessária permissão adicional de leitura/escrita das environment variables
na chave do MESMO Convex Production. Nenhuma configuração de staging é tocada.

A liberação comercial continua bloqueada até entrega real do provedor de email,
backup com restauração testada, documentos LGPD e aceite versionado.

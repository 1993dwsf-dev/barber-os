# Bootstrap das variáveis — Convex Production (primeiro cliente)

Fluxo manual no GitHub Actions: configure-convex-first-client.yml. Usa o secret
CONVEX_FIRST_CLIENT_DEPLOY_KEY no environment convex-primeiro-cliente e recusa
outra implantação além de prod:clever-squid-863.

Preenche quando ausentes: SITE_URL, login por senha habilitado, Google desabilitado,
comercial e billing desabilitados. Gera par JWT_PRIVATE_KEY e JWKS somente quando
ambos estão ausentes, nunca revela segredos e não rotaciona chaves. Não inventa
chaves Brevo ou Resend. Não cria contas, convites ou dados.

Falha diagnosticada na primeira execução: a chave existente pode fazer deploy, mas
não consegue listar as variáveis. Exigir exatamente as três permissões:
- deployment:deploy
- deployment:env:view
- deployment:env:write

No Convex Dashboard, gerar chave nova SOMENTE do deployment Production
clever-squid-863, com essas permissões. No GitHub environment
convex-primeiro-cliente, substituir o valor de CONVEX_FIRST_CLIENT_DEPLOY_KEY,
sem copiar valor para issues ou conversas. Reexecutar o workflow
Configuração inicial Convex Production — primeiro cliente.
Após a migração funcionar, revogar a chave antiga no Convex.
Nenhuma configuração de staging é tocada.

A liberação comercial continua bloqueada até entrega real do provedor de email,
backup com restauração testada, documentos LGPD e aceite versionado.

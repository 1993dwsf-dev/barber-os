# Liberação de produção — piloto Barber OS

## Estado desta mudança
- Apenas gates de build do Cloudflare Pages, testes automatizados e CI da staging; não há deploy nem ativação comercial.
- Homologação: `VITE_STAGING_ONLY=true`, branch `staging`, `VITE_CONVEX_URL` da homologação.
- Produção futura: `VITE_STAGING_ONLY=false`, `VITE_PRODUCTION_ENABLED=true`, branch `production`, URL Convex de deployment separado.
- Não conectar a produção ao deployment conhecido de homologação `unique-tortoise-387.convex.cloud`.
- `VITE_*` são variáveis públicas: nunca armazenar chaves privadas nelas.

## Checklist obrigatório antes da primeira conta pagante
- [ ] Obter evidência de CI da branch e aprovação de revisão do PR; executar build e testes no commit final.
- [ ] Provisionar Convex Production separado; validar `SITE_URL`, chaves Convex Auth e autenticação real.
- [ ] Configurar Pages Production e validar navegação após refresh nas rotas protegidas.
- [ ] Testar criação de duas barbearias com usuários reais distintos; provar bloqueio cruzado de leitura, mutação, arquivos, agenda, financeiro e relatórios.
- [ ] Provar RBAC por perfil e suspensão/trial expirado em operações do backend (não apenas UI).
- [ ] Ensaiar entrada e saída de funcionários; preservar vínculos e dados existentes na migração de login.
- [ ] Configurar remetente transacional real; validar códigos, limites, recuperação e entrega Gmail/Outlook. Brevo fica para etapa posterior, sem ativação neste PR.
- [ ] Configurar backup Convex e testar restauração em ambiente descartável, inclusive arquivos; exportar JSON no app não equivale a backup restaurável.
- [ ] Revisar termos de uso, privacidade/LGPD, aceite e canais de suporte.
- [ ] Executar smoke em celular e desktop para onboarding, agenda, caixa, PDV, permissões e fluxo de pagamento.
- [ ] Definir procedimento manual de cobrança e liberação administrativa, com recibo e conciliação, antes de vender sem recorrência.
- [ ] Fazer plano de rollback e verificar logs/alertas antes de liberar clientes.

## Critério de aprovação
Nenhum cliente pagante entra até que os itens de identidade, isolamento, backup restaurável e entrega de e-mail estejam validados no ambiente que será utilizado. Não realizar merge na `main` nem deploy comercial por esta alteração.

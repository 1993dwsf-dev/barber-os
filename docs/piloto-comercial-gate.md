# Barber OS — Pilot Gate v1 (pré-billing)

Esta etapa **não cobra clientes**, **não cria checkout**, **não habilita acesso público**. Implementa somente convite individual e entitlement de teste, preparando o controle de assinaturas.

## Ambientes

- `staging` e o deployment atual `unique-tortoise-387` permanecem com `BARBER_AUTH_COMMERCIAL_ENABLED=false` e `BARBER_BILLING_ENFORCED` ausente/falso. Todos os cadastros/testes existentes continuam funcionando.
- Em um **projeto Convex separado** para piloto, configurar `BARBER_BILLING_ENFORCED=true` ativa o requisito de convite e status para novas organizações. Ativar `BARBER_AUTH_COMMERCIAL_ENABLED=true` também ativa esse bloqueio, para evitar cadastro comercial aberto acidentalmente.
- Ao exigir gate, organizações existentes sem entitlement **não podem executar escrita**; operações de leitura continuam funcionando. Exportação de dados por owner/admin continua permitida.
- Nunca ativar flags comerciais antes de ter e-mail de envio próprio verificado, regras de cobrança/contrato e ambiente separado.

## Fluxo de piloto (para implantação futura)

1. Um operador autorizado em Convex interno gera `issuePilotInvite` para um endereço específico, com `trialDays` de 1 a 30. O convite vence em sete dias e o token tem 256 bits aleatórios.
2. A conta verificada entra por Google ou senha; `createOrganization` recebe `pilotInviteCode` somente na experiência comercial futura (a interface atual ainda não coleta o token).
3. A criação grava a organização, consome o convite e registra `organizationEntitlements` com status `trialing` e expiração verificável.
4. Escritas no backend exigem status válido, aplicado por `requireManage` e `requireOwner`, **não por flag visual**. Trial expirado, plano cancelado e tenant sem entitlement não podem registrar vendas ou atualizar dados.
5. `commercialStatus` devolve ao usuário membro seu status sem revelar o código do convite.

## Políticas de estado (somente para futura cobrança)

- `trialing`: permitido até `trialEndsAt`.
- `active`: permitido até `periodEndsAt`.
- `past_due`: permitido até `graceEndsAt`.
- `canceled` e `suspended`: bloqueados para escrita.
- Sem entitlement: bloqueado para escrita.

**Limites/pendências:** Não há integração de pagamento, webhook, UI de convite/assinatura, tenant deletion, teste de carga comercial nem ajuste de todas as mutações menores que usam apenas `requireMember` (como marcar alertas). Acesso de leitura continua disponível após expiração como política de portabilidade; deve ser avaliado juridicamente e comercialmente. Não existe autorização automática para preço/assinatura. Esse PR é base técnica para um piloto com dados fictícios e execução interna controlada.

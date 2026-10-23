# Barber OS — checklist de liberação comercial (23/10/2026)

**Status:** homologação funcional, segurança P1 validada, não liberado comercialmente.
**Política:** proteger `main` e a homologação `staging` até a existência de um ambiente de produção isolado. Não colocar dados de clientes reais na homologação.

## Bloqueadores antes de aceitar barbearias de verdade

| Prioridade | Área | Entrega verificável | Responsável/ambiente |
| --- | --- | --- | --- |
| P0 | Produção separada | Projeto Convex **novo** e deployment Production, Cloudflare Pages **novo** com branch própria, credenciais distintas e rollback testado | Infra |
| P0 | E-mails de clientes | Domínio remetente verificado no Resend; envio OTP, verificação e reset para ao menos duas caixas externas; taxa de falhas acompanhada | E-mail |
| P0 | Abertura controlada | Nada de abrir `BARBER_AUTH_COMMERCIAL_ENABLED` na homologação; exigir autorização de novos tenants e política de teste, cobrança e cancelamento | Produto/backend |
| P0 | Cobrança e entitlement | Gateway brasileiro e assinaturas, webhooks autenticados/idempotentes, `subscriptionStatus`, aplicação de autorização no backend para acesso comercial, inadimplência/grace period | Produto/backend |
| P0 | Dados e LGPD | Corrigir `BarberFlow OS` no `Legal.tsx`; identificar efetivo prestador (dados empresariais e contato); definir responsabilidades controlador/operador por finalidade, canal para titulares e procedimento de exclusão/retorno de dados; revisão jurídica | Negócio/jurídico |
| P0 | Backups/recuperação | Backup automático do Convex Production, política de retenção, restore documentado e testado, custo/limites verificados; export JSON atual não substitui backup integral | Infra |
| P1 | Observabilidade | Alertas de falha de auth, funções, latência, limite de recurso e uso do Resend; procedimento de incidente e responsáveis | Infra |
| P1 | Segurança da aplicação | Testes adversariais autenticados com contas de duas organizações, papéis distintos; review de endpoints sensíveis, URLs de arquivos e controle antiabuso em signup/OTP | QA/segurança |
| P1 | Armazenamento | Verificar assinatura binária (MIME armazenado não garante formato real); definir política de arquivos, uploads órfãos, URLs compartilháveis e exclusão | Backend |
| P1 | Convites e equipe | Usar links/códigos com prazo e revogação, trilha de auditoria, limitar papéis; revisar exposição de contatos | Backend |
| P1 | Custos e planos | Simular 3, 10, 30 barbearias e consumo Convex/Pages/Resend/armazenamento; preços precisam superar taxas e custos recorrentes | Comercial |
| P2 | Piloto | 2–3 barbearias convidadas com dados fictícios, roteiro de suporte, teste de importação/cancelamento/exportação | Produto |

## Ordem recomendada

1. **Preparar a operação:** definir nome empresarial, canais de suporte, domínio de envio e responsável pela revisão legal.
2. **Arquitetar o billing/tenant status:** o código atual permite criar organizações verificadas, mas não comprova assinatura ativa; não tratar onboarding atual como paywall.
3. **Provisionar um ambiente de produção novo** com segredos exclusivos e sem herdar a allowlist nem dados da homologação.
4. **Completar backup e testes de restauração**, revisar endpoints de maior risco, instrumentar alertas.
5. **Piloto controlado** em dados fictícios, ensaiar faturamento/assinaturas e medir uso real.
6. **Abertura gradativa** somente com operação, suporte, cobrança, privacidade e rollback efetivos.

## Cuidados específicos conhecidos no código

- `src/convex/auth/emailOtp.ts` tinha uma allowlist independente da flag comercial. Ela foi unificada com `authorizeCurrentTransactionalEmail`, com proteção contra remetente `@resend.dev` em ambiente hospedado comercial. Isso não configura ou verifica DNS do Resend.
- `src/convex/orgs.ts::createOrganization` não exige contrato/plano pago, apenas usuário autenticado com e-mail verificado e limite de frequência. Precisa de entitlement comercial antes de abrir o backend.
- `src/pages/Legal.tsx` utiliza a marca anterior `BarberFlow OS` e contém textos genéricos; não publicar como declaração jurídica definitiva sem dados/contratos verificados. A exigência de encarregado/DPO varia com enquadramento da operação; oferecer canal de comunicação continua essencial.
- `backup.exportOrganizationData` é exportação JSON com limites de linhas e não é um snapshot gerenciado integral nem rotina de restauração.
- A `staging` está intencionalmente bloqueada a um e-mail, mesmo que a interface de login permita criar conta.

## Regra de liberação

Não habilitar `BARBER_AUTH_COMMERCIAL_ENABLED=true` nem relaxar `BARBER_STAGING_EMAIL` na homologação atual. Essa flag só pode ser habilitada depois que infraestrutura, e-mails verificados, autorização comercial/assinaturas, termos aplicáveis e rollback estiverem testados em **outro deployment**.

Fontes de referência: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte ; https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022 ; https://resend.com/docs ; https://docs.convex.dev

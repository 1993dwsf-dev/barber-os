# Barber OS — Plano de lançamento mínimo (26/10/2026)

## Decisão de produto
**Congelar desenvolvimento de funcionalidades**, incluindo console de emissão Asaas Sandbox (PR #41 pausado sem merge). O próximo marco não é mais uma integração: é uma barbearia conseguindo entrar, cadastrar serviços/clientes fictícios, usar a agenda e o PDV, e decidir se paga.

A `staging` segue sendo **homologação**, não ambiente para dados reais. Não promover automaticamente `staging` para `main` e não ativar flags comerciais no deployment `unique-tortoise-387`.

## Essencial no primeiro MVP

- **Acesso do proprietário**: login com verificação e recuperação, convite pré-aprovado (email + token de uso único), onboarding simples.
- **Operação principal**: cadastro da barbearia e de serviços/preços, barbeiros básicos, clientes, agenda, registro de atendimento/venda e caixa. Conferir no celular.
- **Segurança mínima não negociável**: isolamento server-side de dados por organização, papéis, dados persistidos no Convex, exportação possível e recuperação testada para uso com clientes reais.
- **Oferta comercial manual no início**: vendedor conversa com a barbearia, combina condições por escrito, recebe Pix de forma independente da plataforma e libera/testa acesso com confirmação administrativa. A confirmação administrativa não deve fazer inferências de pagamento a partir do webhook Sandbox. Não usar o estado `trialing` para afirmar que uma assinatura paga está ativa.
- **Privacidade**: termos e política revisados com dados reais do operador e canal de suporte; aceite de versão dos termos com data/hora e identificação de quem aceitou antes de dados reais, conforme revisão jurídica.

Recursos **não necessários** ao MVP: emitir cobranças via Asaas, conciliação automática de cobrança, assinaturas recorrentes, MRR, automação de cobrança, upgrades, programas avançados de fidelidade, relatórios complexos, ferramentas extras de admin. Não remover o código existente; manter recursos desligados e não criar telas novas para eles.

## Bloqueios realmente identificados na auditoria do código

| Prioridade | Questão | Evidência no repositório | Liberação |
| --- | --- | --- | --- |
| P0 | E-mail para novas contas | `auth/accessPolicy.ts` bloqueia e-mails fora da allowlist em homologação; `auth/emailOtp.ts` exige remetente próprio quando comercial aberto | Configurar domínio de envio verificado no Resend, testar OTP e recuperação em pelo menos 2 caixas reais **no novo ambiente** |
| P0 | Convites comerciais não enviados pelo frontend | `orgs.createOrganization` exige `pilotInviteCode` de 64 caracteres vinculado a email, mas `Onboarding.tsx` da staging não tinha o campo | Corrigido na branch `fix/mvp-pilot-invite-onboarding`, com testes pendentes de CI/QA. O código de equipe da aba “Tenho um convite” é diferente |
| P0 | Infraestrutura isolada | `docs/homologacao.md` indica que `staging` usa Convex Development, email de teste e domínio Pages de homologação | Deployment de produção isolado, chaves novas, configuração/rollback verificados, sem copiar dados do Sandbox |
| P0 | Documentos legais provisórios | `Legal.tsx` traz texto genérico e contato incompleto | Definir operador do Barber OS, contato/ suporte, controlador-operador conforme finalidades, revisão e mecanismo de aceite |
| P0 | Recuperação de dados incompleta | `backup.ts` exporta JSON limitado; não há importação/restore testado | Backup da produção e teste de restauração em ambiente descartável antes de dados reais |
| P0 | Fluxo comercial manual verificável | `commercial.ts` exige entitlement ao habilitar comercial; `orgs.ts` já cria trial sob convite | Testar ponta a ponta convite → criação → `trialing` → agenda → caixa → suspensão/reingresso; estabelecer rotina escrita de pagamento e manutenção de acesso |
| P1 | Qualidade | CI com testes de backend, auth, navegador e storage é evidência parcial, não prova com dados reais | Teste guiado em dois perfis, navegador móvel, 2 barbearias isoladas, erros e exportação |
| P1 | Marca e comunicação | Algumas telas exibiam “BarberFlow OS” e promessas comerciais amplas | Uniformizar “Barber OS”, retirar alegações não comprovadas e apresentar agenda, clientes e caixa |

## Caminho mais rápido para validar sem comprometer clientes

**Hoje — demonstração:** ofertar demonstração acompanhada em barbearia local, usando base inteiramente fictícia. Pode gerar leads e intenção de compra sem liberar login comercial. Coletar feedback (sem cadastrar dados reais de clientes na homologação).

**Próximos 1–3 dias — fechar bloqueios técnicos:** corrigir convite no onboarding, executar QA da jornada e validar se um segundo e-mail pode receber o código **em ambiente comercial isolado**. Preparar formulário de aceite, textos legais revisados e estratégia de backup/restore.

**Próximos 4–7 dias — primeiro piloto privado, condicionado aos P0:** abrir só para 1–2 negócios convidados. Cada estabelecimento recebe seu tenant isolado. Oferecer condições simples por escrito e cobrar manualmente por Pix fora do Barber OS, com controle financeiro externo e emissão de documentos fiscais quando cabível. Registrar incidentes e acompanhar uso.

**Meta comercial de validação:** 5 conversas com barbeiros, 3 demonstrações e ao menos 1 proposta enviada. Essas são metas operacionais, não resultados já obtidos. Não prometer "lançamento em 7 dias" se algum P0 continuar falhando.

## Checklist de aprovação do primeiro tenant com dados reais

- [ ] O mesmo owner recebe login/OTP e consegue recuperar o acesso em outro dispositivo.
- [ ] Convite de uso único vinculado a email cria exatamente uma organização com período de teste.
- [ ] Outra barbearia não consegue ler/alterar clientes, agenda, caixa ou arquivos da primeira.
- [ ] Agendamento → conclusão → venda/caixa funciona em celular.
- [ ] Dados permanecem após sair, recarregar e limpar cache (com login novamente).
- [ ] Termos e privacidade completos, revisados, com aceite registrável.
- [ ] Backups reais, restore ensaiado, procedimentos de suporte e incidentes.
- [ ] Configuração de envio confiável, contas da infraestrutura e custos verificados.
- [ ] Manual de cobrança, renovação e cancelamento definido; nenhuma ativação automática pelo Asaas Sandbox.
- [ ] Produção e homologação fisicamente separadas; rollback testado.

**Regra GO / NO-GO:** sem os itens P0 concluídos, pode haver demonstração comercial com dados fictícios; não cadastrar dados pessoais de clientes reais no deployment de homologação.

## Informação mínima a solicitar ao responsável

Para retirar placeholders e preparar a oferta: **(1)** nome/razão social do operador (CNPJ se houver), **(2)** canal de contato/suporte público, **(3)** decisão sobre domínio próprio para e-mails de clientes, **(4)** preço piloto e condições de pagamento manual. Não solicitar API keys no chat.

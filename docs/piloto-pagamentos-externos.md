# Decisão comercial do piloto — pagamentos fora do Barber OS

## Escopo aprovado

A cobrança das **assinaturas do Barber OS** será realizada diretamente pelo operador, fora do aplicativo. Não integrar gateway, checkout, Pix automático, boleto, conciliação de assinatura, webhook de pagamento ou emissão de recibo de assinatura neste piloto.

**Não confundir:** o módulo PDV/Caixa da barbearia registra vendas de serviços e produtos feitas pela própria barbearia e continua funcionando normalmente. A restrição acima se refere exclusivamente às mensalidades que o operador cobra dos estabelecimentos pelo uso do SaaS.

## Acesso técnico ≠ cobrança

O sistema mantém o controle técnico de acesso por organização, data de validade e status de autorização (entitlements). Essa função protege o acesso quando o período autorizado termina, mas não é um processador de pagamentos. Os registros de cobrança, transferência, comprovantes e decisão de renovação ficam fora do Barber OS, sob responsabilidade do operador.

Para o futuro piloto:
- Cadastrar cada estabelecimento por convite individual.
- Definir ou renovar o período de acesso somente após decisão do operador, sem criar pagamentos fictícios no banco.
- Nunca usar um webhook de sandbox ou confirmação de pagamento simulada para liberar acesso real.
- Não ativar infraestrutura comercial no ambiente DEV atual.
- Testar vencimento, suspensão de escrita e preservação de exportação de dados em ambiente de QA isolado.
- Documentar procedimento de revogação e suporte, sem registrar dados bancários na plataforma.

**Importante:** o repositório contém infraestrutura experimental de billing/sandbox de etapas anteriores. Sua existência no código **não autoriza ativá-la**. Esta decisão de produto exige não disponibilizar nenhuma interface de cobrança da assinatura ao usuário final e não implementar integrações adicionais.

## E-mail sem domínio próprio

Para testar o Brevo, selecionar BARBER_EMAIL_PROVIDER=brevo somente no Convex de QA, com BREVO_API_KEY e BREVO_FROM_EMAIL cadastrados como variáveis privadas. Na ausência da seleção, Resend permanece o padrão. O preflight avalia apenas a configuração; não certifica a entrega ao destinatário nem a aprovação do remetente. A Brevo pode trocar remetentes gratuitos por um endereço técnico, e isso exige testes em caixas externas.

Sem custos obrigatórios com domínio nesta etapa, sem permitir que a ausência de domínio reduza os controles de autenticação, isolamento de dados ou recuperação de senha.

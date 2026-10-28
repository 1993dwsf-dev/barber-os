# Brevo no Barber OS — experimento sem domínio próprio

**Status:** provedor alternativo implementado, NÃO ativado em homologação nem aprovado para clientes pagantes.

## O que realmente é gratuito

O plano Free do Brevo limita o envio total a 300 mensagens por dia, incluindo mensagens transacionais. Isso não garante entregabilidade. Um remetente Gmail/Outlook não tem domínio próprio autenticável; o Brevo pode substituí-lo por domínio técnico (por exemplo, @t-sender-sib.com). Essa substituição é temporária e não é uma solução comercial validada, especialmente para recuperação de senha.

Documentação oficial:
- https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
- https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders
- https://developers.brevo.com/reference/send-transac-email
- https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email

## Segurança e compatibilidade

Sem BARBER_EMAIL_PROVIDER, o Barber OS continua usando Resend por padrão, com RESEND_API_KEY e RESEND_FROM_EMAIL existentes. A integração Brevo não altera cadastro, papéis, login por senha, sessões, allowlist de homologação nem o prazo de validade de códigos. OTP, confirmação de e-mail e reset compartilham a mesma rotina.

Não inserir API keys em GitHub, Cloudflare VITE_*, código versionado ou conversas. Não habilitar o Brevo no deployment atual sem validar primeiro o remetente.

A seleção é EXCLUSIVAMENTE pelo backend Convex, no deployment apropriado:

| Variável privada | Exemplo |
| --- | --- |
| BARBER_EMAIL_PROVIDER | brevo |
| BREVO_API_KEY | Chave privada criada em Brevo, nunca versionada |
| BREVO_FROM_EMAIL | Barber OS <remetente@example.com> |

O endereço acima é ilustrativo. Não configurar valores fictícios.

Para voltar ao Resend, remover BARBER_EMAIL_PROVIDER ou definir resend, mantendo as variáveis Resend existentes.

## Plano de validação com caixas autorizadas

1. Criar conta gratuita Brevo e verificar se a função de e-mails transacionais está habilitada.
2. Cadastrar e validar um remetente em Senders. Verificar se Brevo substitui o endereço por um remetente técnico. Verificar remetente NÃO equivale a autenticar domínio DKIM/DMARC.
3. Configurar as três variáveis apenas num backend Convex de QA separado, com dados fictícios. Não abrir BARBER_AUTH_COMMERCIAL_ENABLED no deployment DEV hospedado atual.
4. Testar recebimento de códigos OTP em Gmail e Outlook autorizados, atraso, spam, remetente exibido, falhas e limites. Testar recuperação de senha, confirmação de conta e sessão após atualização.
5. Se houver falha ou entregabilidade inconsistente, NÃO liberar novos clientes. Manter Resend na homologação e pesquisar outro envio seguro sem custo de domínio.
6. Antes de clientes pagantes, exigir backend e Pages independentes, restauração em outro deployment, LGPD/aceite, cobrança e suporte.

## Sem ativação automática

O PR do adaptador não envia e-mails reais e NÃO modifica BARBER_AUTH_COMMERCIAL_ENABLED, BARBER_BILLING_ENFORCED ou as variáveis hospedadas atuais. A resposta HTTP 201 do provedor não comprova entrega ao destinatário.

# Primeiro cliente — Brevo protegido

Usar exclusivamente o ambiente GitHub "convex-primeiro-cliente" e deployment
"prod:clever-squid-863" para as credenciais de e-mail.

Criar em GitHub Settings > Environments > convex-primeiro-cliente >
Environment secrets (sem inserir chaves em Issues, arquivos ou ChatGPT):
- BARBER_FIRST_CLIENT_BREVO_KEY: chave API v3 privada do Brevo.
- BARBER_FIRST_CLIENT_BREVO_FROM: endereço de remetente que a conta Brevo aprovou.
  Exemplo de formato: Barber OS <contato@dominio.example> (exemplo, nunca copiar).

Assim que ambos forem criados, reexecutar GitHub Actions >
"Provisão protegida de e-mail Brevo — primeiro cliente" > Run workflow
(branch production). O assistente pode disparar essa etapa após o aviso do usuário.

A rotina nunca configura automaticamente cadastro comercial, assinatura ou
convites, não envia e-mail e não altera valores já existentes que sejam diferentes.
Se houver falha por valores divergentes, requer revisão manual para não
sobrescrever credenciais.

A resposta de API 201 não prova recebimento: validar confirmação de conta,
reset de senha, Gmail e Outlook, caixa de spam e remetente real, antes de
autorizar clientes reais. Sem domínio próprio, um remetente técnico reescrito
pelo Brevo não é garantia de entregabilidade comercial.

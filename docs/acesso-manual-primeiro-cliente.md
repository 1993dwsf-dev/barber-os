# Barber OS — entrega manual de códigos para o primeiro cliente

## Objetivo e escopo

O primeiro cliente pode usar **e-mail + senha**, sem Brevo, Resend, domínio próprio, Google OAuth ou SMTP. A biblioteca Convex Auth continua emitindo e validando códigos criptograficamente aleatórios no cadastro e na recuperação. **A entrega não é automática:** um operador transmite o código por canal confiável após conferir a identidade do destinatário.

Este processo **não comprova posse da caixa de e-mail**. O operador deve confirmar a identidade e o vínculo do cliente com o e-mail informado, por contato previamente acordado, presencialmente ou WhatsApp previamente confirmado. **Não** marcar emailVerificationTime manualmente nem entregar código a quem apenas sabe o e-mail.

## Segurança e disponibilidade

- O banco Convex guarda temporariamente o token em `manualAuthCodes`; esta tabela é visível apenas ao operador com acesso administrativo ao Dashboard e não faz parte da exportação de dados da barbearia. Não capturar screenshots, logs ou backups dessa tabela.
- `enqueueManualCode` e `pendingManualCodes` são **internal**, sem endpoint público; exige autenticação com privilégios do Convex Dashboard para consulta manual.
- Validade: **15 minutos**. Novas solicitações de mesmo e-mail + tipo substituem os códigos anteriores na fila; a verificação e o limite de tentativas continuam no Convex Auth.
- Os códigos são segredos temporários em texto claro na fila, necessários à entrega humana. Excluir dados vencidos e restringir operadores do projeto; se houver incidente, interromper a liberação e rotacionar credenciais.
- A geração do código de recuperação não altera a senha até o cliente concluir a validação.
- O modo manual não cria automaticamente contas, barbearias, convites nem assinaturas; `BARBER_AUTH_COMMERCIAL_ENABLED` segue exigindo convite operacional para criar organização.

## Configuração isolada (apenas depois dos testes)

1. Em **Convex Production** `clever-squid-863` → Environment Variables, definir `BARBER_EMAIL_PROVIDER=manual`. Não usar Brevo nem Resend. Manter `BARBER_AUTH_COMMERCIAL_ENABLED=false` até concluir QA.
2. Publicar backend com a branch validada `production` (nunca `unique-tortoise-387`). Confirmar que a tabela `manualAuthCodes` existe.
3. Em **Cloudflare Pages comercial** (`barber-os-cliente.pages.dev`), definir variável de build `VITE_MANUAL_CODE_DELIVERY_ENABLED=true`, mantendo o frontend apontado para `https://clever-squid-863.convex.cloud`. Publicar novo build após o merge.
4. Em QA isolado, testar código de 8 dígitos para cadastro e recuperação; sem envio de e-mail, WhatsApp ou mensagem automática.
5. Apenas com identidade conferida, convite interno operacional e LGPD/backup testados, habilitar `BARBER_AUTH_COMMERCIAL_ENABLED=true` e emitir **um** convite para o primeiro cliente. Não executar teste com dados pessoais reais antes dos gates P0.

## Operação assistida de cadastro e recuperação

1. O titular abre a tela de cadastro, informa e-mail e escolhe senha forte. Convex Auth gera token; a entrega manual salva o código na tabela privativa.
2. O titular solicita o código ao suporte pelo WhatsApp/telefone previamente validado, SEM divulgar sua senha.
3. No **Convex Dashboard autorizado** → Functions, executar **internal** `auth/emailOtp:pendingManualCodes` com `{"email":"email-do-titular@example.com"}`. Visualizar exclusivamente o registro da finalidade `verification` ou `reset` e checar o prazo.
4. O operador envia **somente o código** diretamente ao titular no canal previamente confirmado, nunca em grupo ou mensagem pública.
5. Titular digita o código na tela e conclui verificação/recuperação. Após login verificado, o código de convite comercial da barbearia é digitado no onboarding e consumido de forma única.
6. Login posterior: somente e-mail e senha. Não pedir código a cada entrada. Se perder a senha, repetir verificação de identidade e fluxo de recuperação.

**Não confundir** os códigos de autenticação (6/8 dígitos) com o convite operacional comercial (64 caracteres hexadecimais). O último é emitido apenas por `orgs:issueOperationalInvite`, é vinculado ao e-mail e controla criação da primeira organização.

## Critério de liberação

Antes de dados reais: executar CI, testes de um código incorreto/expirado, abertura sem verificação, conta errada, convite inválido/consumido, recuperação de senha, acesso móvel, isolamento de dados, restore e aceite dos termos/LGPD. Não confundir status verde de GitHub Actions com prova de operação ponta a ponta.

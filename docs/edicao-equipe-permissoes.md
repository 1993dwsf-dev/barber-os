# Equipe e permissões — edição segura

O painel **Configurações → Equipe** lista **contas com acesso**, não todos os cadastros de profissionais.

- **Editar nome** (proprietário): altera apenas `organizationMembers.displayName` nesta barbearia; não modifica `users.name`, e-mail de login, autenticação ou cadastro de barbeiro. É possível corrigir nomes genéricos como “Anon”.
- **Perfil de acesso**: o proprietário pode ajustar o papel de outros membros. Seu próprio papel de **Proprietário** permanece fixo nesta tela; não pode ser rebaixado nem removido quando for o último proprietário.
- **Profissional vinculado**: pode ser selecionado, alterado ou removido mesmo quando o membro já tinha vínculo. Um mesmo perfil de barbeiro não pode pertencer a duas contas simultaneamente, evitando leitura duplicada dos seus atendimentos e comissões.
- **Novo membro**: entra com conta própria por código da unidade, em **Código de convite**, abaixo da lista. Cadastrar novo profissional em **Barbeiros** não cria automaticamente uma conta de usuário.
- **Excluir membro**: disponível ao proprietário apenas para outras contas, não para a própria conta.

Todas as alterações são verificadas no backend Convex por organização e permissões, com trilha de auditoria. Nenhum recurso de faturamento foi aberto. A autenticação externa de novos funcionários continua restrita na homologação; a validação com contas reais ocorrerá em QA separado.

## Verificação na homologação

1. Entre como proprietário e abra **Configurações → Equipe**.
2. No seu próprio registro, clique **Editar nome** e substitua o nome de exibição. Verifique que o e-mail permanece igual.
3. Em **Profissional vinculado**, selecione **Sem vínculo** e depois reatribua seu perfil de barbeiro. **Atenção:** durante o teste, não atribua um profissional já vinculado a outro membro.
4. Confira que **Proprietário** está visível mas não permite rebaixar a própria conta.
5. Se houver funcionário de teste, ajuste a função dele, associe seu cadastro profissional e confirme o isolamento de informações no login desse funcionário.

Se só existir o proprietário, a seção não deve permitir criar um “membro novo” diretamente nem inserir outra pessoa usando o mesmo login.

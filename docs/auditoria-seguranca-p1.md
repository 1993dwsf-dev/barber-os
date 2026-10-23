# Barber OS — revisão P1 de segurança multiempresa

Esta alteração fortalece o backend Convex em ambiente de revisão isolado. Nenhuma flag de autenticação nem dado existente é modificado.

- Onboarding: apenas owner pode alterar etapa; intervalo permitido de 0 a 7 ou concluído.
- Equipe: listagem exige a capacidade de visualizar "team", preservando owner, admin, manager e viewer conforme a matriz RBAC.
- Upload: emissão de URL exige permissão de gestão (padrão settings para compatibilidade, ou `recordType` explícito); registro compara tamanho/MIME com `_storage`, recusa arquivo inexistente ou já associado; despesas aplicam as mesmas verificações.
- Download: o endpoint exige acesso à organização *e* permissão de leitura do módulo do anexo.
- Testes: verificam isolamento entre duas organizações, negação de funções por papel, metadados adulterados e reutilização de storageId.

**Limitações:** o Content-Type de `_storage` é indicado por quem envia o arquivo e não prova o conteúdo binário. Para upload de documentos de clientes desconhecidos, avaliar validação de assinatura e antivírus em ação de backend. URLs de download do Convex são acessíveis a qualquer pessoa que as tenha; a autorização precisa ser verificada antes de compartilhar e revogação exige exclusão do arquivo ou proxy autenticado. Ainda não há teste de penetração abrangente.

## Procedimento seguro

1. Executar CI e smoke em PR contra `staging`.
2. Revisar acessos de papéis não proprietários em equipe, uploads e documentos.
3. Confirmar que as funções Convex locais foram testadas antes da publicação.
4. Integrar na homologação somente após todos os checks e smoke final. Não realizar deploy em Production Convex.

Referências: https://docs.convex.dev/file-storage/file-metadata e https://docs.convex.dev/file-storage/overview

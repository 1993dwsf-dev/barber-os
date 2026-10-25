# Relatórios CSV e exportação JSON — Barber OS

## Arquivos para Excel: CSV (padrão obrigatório)

Todos os **relatórios de negócio** para download deverão usar **.csv**. A tela Relatórios exporta Resumo, Vendas, Agendamentos, Despesas, Comissões, Estoque e Clientes; as telas individuais Despesas e Comissões também exportam CSV.

Convenção do arquivo:
- Codificação UTF-8 com BOM, para manter acentos em Excel/LibreOffice.
- Delimitador de colunas: ponto e vírgula (`;`), adequado ao Excel em português brasileiro.
- Valores monetários: vírgula decimal (exemplo: `1234,50`).
- Aspas e quebras de linha escapadas no formato CSV; campos começando por sintaxe de fórmula de planilha são neutralizados para reduzir riscos ao abrir dados recebidos de clientes.
- Extensão `.csv` em todos os downloads de relatórios. Arquivos com dados pessoais merecem armazenamento restrito, não envio por canais públicos.

No Excel, abra o arquivo CSV com duplo clique se a configuração regional estiver em PT-BR. Se aparecer tudo na coluna A, use **Dados → De Texto/CSV**, escolha **UTF-8** e delimitador **Ponto e vírgula**. No LibreOffice Calc, selecione UTF-8 e `;` na importação. O CSV é uma tabela plana e não preserva fórmulas, gráficos, múltiplas abas ou relações entre entidades.

## Exportação técnica da unidade: JSON (não é um relatório)

O comando **Configurações → Backup → Exportar dados (JSON)** grava dados estruturados (organização, usuários vinculados sem credenciais e até 5.000 registros por tabela com sinalização `truncated`). O arquivo contém seções como:

```json
{
  "generatedAt": 1792960000000,
  "organization": { "name": "Exemplo" },
  "users": [],
  "counts": { "clients": 0 },
  "truncated": [],
  "data": { "clients": [], "appointments": [], "sales": [] }
}
```

O conteúdo acima é **ilustrativo**, não é um backup restaurável. IDs, campos e valores mudam conforme o schema. Anexos no storage não são incorporados como bytes neste JSON, apenas metadados/referências. A exportação pode ser parcial; verificar `truncated` e `counts`.

### Como visualizar o arquivo baixado

1. Abra com **VS Code**, **Notepad++** ou outro editor de texto (ideal para conferir estrutura e registros).
2. Para ver **tabelas no Excel**, selecione **Dados → Obter Dados → De Arquivo → De JSON** (Power Query, quando disponível), escolha `data`, selecione a tabela de interesse (por exemplo `clients`) e expanda registros para colunas. Pode exigir transformação manual.
3. Não cole nem envie o arquivo a conversores JSON online desconhecidos: ele pode conter telefones, e-mails, dados financeiros e histórico de clientes.

### E se precisar colocar os dados de volta?

**Hoje NÃO há função de restauração por upload de JSON.** O botão atual faz apenas exportação. Não ofereça esse arquivo como garantia de recuperação integral da barbearia.

Para suportar restauração no futuro, será necessário desenvolver, **em ambiente de QA isolado e antes da operação comercial**, um procedimento que:
- Verifique origem, versão do schema, integridade do arquivo e tabelas truncadas.
- Confira vínculos entre entidades, usuários e organizações (IDs de origem não podem simplesmente ser reutilizados em outra instância).
- Trate com segurança informações ausentes da exportação, inclusive anexos em storage, credenciais e registros globais.
- Simule prévia/dry-run, mapeie conflitos e efetue escrita em lotes consistentes sem duplicar vendas, pagamentos, comissão, fidelidade ou estoque.
- Exija autenticação e autorização explícita, registre operações, defina política de substituição versus migração e implemente rollback/teste de restauração.
- Considere backups e snapshots **gerenciados pelo Convex** além do JSON; documente e valide recuperação antes de aceitar dados reais.

**Não** importar o conteúdo manualmente em tabelas do Convex em produção nem convertê-lo em CSV e reimportar como se fosse backup; isso perderia referências e consistência financeira.

### Escopo

Esta alteração **não** introduz restauração nem muda a proteção de login da homologação. O trabalho LGPD/documentos/aceite continua programado para a etapa final do projeto.

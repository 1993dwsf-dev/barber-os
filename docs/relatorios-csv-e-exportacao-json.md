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

### Como visualizar o backup JSON

O arquivo com extensão `.json` é um **documento de dados estruturados**, não uma planilha pronta. Você pode conferir o conteúdo sem instalar um programa específico do Barber OS:

1. **Visualização rápida no computador:** abra o arquivo baixado no **VS Code**, **Notepad++** ou outro editor que suporte JSON. Localize as chaves `organization`, `counts`, `truncated` e `data`. Em `data`, ficam listas como `clients` (clientes), `appointments` (agendamentos), `sales` (vendas) e `products` (produtos).
2. **Visualização em colunas no Microsoft Excel:** nas versões que possuem **Power Query**, vá a **Dados → Obter Dados → De Arquivo → De JSON**. Escolha o arquivo e, no editor, navegue até `data`, selecione a lista desejada (por exemplo, `clients`), converta em tabela e expanda os registros em colunas. Clique em **Fechar e Carregar**. A sequência exata de menus varia conforme a versão do Excel.
3. **Planilhas alternativas:** LibreOffice Calc e aplicativos similares geralmente trabalham melhor com CSV. É possível converter localmente **cada tabela** do JSON para CSV, sem enviar a terceiros, somente para análise; essa conversão não serve para restauração do banco.
4. **Antes de confiar na cópia:** confira `counts` (quantos registros foram exportados por tabela) e `truncated` (tabelas cortadas). **Se `truncated` não estiver vazio, a exportação é parcial.** A ausência dessa sinalização também não garante que anexos e todos os recursos do Convex foram copiados.

**Segurança:** o JSON pode conter telefones, nomes, e-mails, atendimentos, valores financeiros e informações de funcionários. Armazene em local protegido, restrinja acesso, não publique no GitHub, não compartilhe por links abertos e não use conversores JSON online desconhecidos.

### Como restaurar os dados no futuro?

**Situação atual:** o Barber OS **NÃO possui** botão de importar ou restaurar o JSON baixado. A exportação é unidirecional. Não existe fluxo homologado para reenviar esse arquivo ao sistema, e não há garantia de recuperação integral da barbearia somente com ele.

Se ocorrer um problema agora, **não tente reimportar o JSON diretamente pelo painel do Convex**: o arquivo inclui referências entre tabelas que precisam ser reconciliadas e pode estar incompleto. Uma recuperação real dependerá dos recursos de backup/snapshot efetivamente habilitados e disponíveis no Convex e de um procedimento de suporte que ainda precisa ser projetado e testado.

Para suportar restauração no futuro, será necessário desenvolver, **em ambiente de QA isolado e antes da operação comercial**, um procedimento que:
- Verifique origem, versão do schema, integridade do arquivo e tabelas truncadas.
- Confira vínculos entre entidades, usuários e organizações (IDs de origem não podem simplesmente ser reutilizados em outra instância).
- Trate com segurança informações ausentes da exportação, inclusive anexos em storage, credenciais e registros globais.
- Simule prévia/dry-run, mapeie conflitos e efetue escrita em lotes consistentes sem duplicar vendas, pagamentos, comissão, fidelidade ou estoque.
- Exija autenticação e autorização explícita, registre operações, defina política de substituição versus migração e implemente rollback/teste de restauração.
- Considere backups e snapshots **gerenciados pelo Convex** além do JSON; documente e valide recuperação antes de aceitar dados reais.

**Não** importar o conteúdo manualmente em tabelas do Convex em produção nem convertê-lo em CSV e reimportar como se fosse backup; isso perderia referências e consistência financeira.

#### Critérios para uma restauração confiável

Antes de disponibilizar **Restaurar backup** no Barber OS, a funcionalidade precisará ser validada com dados fictícios e cumprir todos estes pontos:

- Identificar o arquivo, a organização de destino e sua versão; rejeitar conteúdo malformado, truncado ou de outra organização.
- Apresentar uma prévia antes da operação, detalhando quantidades, conflitos e consequências.
- Preservar relacionamentos de clientes, atendimentos, vendas, pagamentos, estoque, caixa, comissões e usuários.
- Recuperar anexos pelo mecanismo adequado e tratar arquivos ausentes.
- Impedir duplicação de transações financeiras e garantir rastreabilidade e possibilidade de reversão.
- Testar restauração de ponta a ponta em **ambiente isolado**, sem sobrescrever dados operacionais.
- Definir e testar uma estratégia de **backup real com o provedor**, separada da exportação JSON.

A implantação e o teste desta função estão registrados na [Issue #26 — Recuperação segura de backups](https://github.com/1993dwsf-dev/barber-os/issues/26). Até sua conclusão, não apresente o JSON como backup restaurável.

### Escopo

Esta alteração **não** introduz restauração nem muda a proteção de login da homologação. O trabalho LGPD/documentos/aceite continua programado para a etapa final do projeto.

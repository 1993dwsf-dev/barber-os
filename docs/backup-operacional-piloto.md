# Barber OS — snapshots, recuperação e ensaio obrigatório (piloto)

**Escopo:** preparar backup e restauração de um deployment comercial Convex **novo**. O ambiente `dev:unique-tortoise-387` permanece intocado. Não inserir dados reais nele.

## 1. Os dois formatos NÃO são equivalentes

- **Exportação JSON da interface Barber OS:** saída de portabilidade por organização, sujeita a limites por tabela (`truncated`). Não possui procedimento automático de importação. **Não** é backup integral restaurável da aplicação.
- **Snapshot ZIP Convex:** tabelas completas e, opcionalmente, binários de Storage, no formato nativo que o Convex consegue importar. Este deve ser o artefato de recuperação. Não inclui código, configuração, variáveis de ambiente, integrações ou tarefas pendentes.

## 2. Antes da primeira barbearia com dados reais

1. Criar um projeto/deployment comercial novo no Convex. Separar suas chaves, variáveis, login e frontend do ambiente de homologação.
2. Criar **apenas dados fictícios** de teste no deployment comercial ainda vazio.
3. Em **Convex Dashboard → Backups**, acionar **Backup Now** (incluindo File Storage se houver arquivos) e baixar o ZIP. Alternativamente, para um deployment específico:
   ```bash
   bunx convex export --deployment NOME_DO_DEPLOYMENT_COMERCIAL --include-file-storage --path backup-piloto.zip
   ```
   Confirme no dashboard o nome exato do deployment antes de executar.
4. Armazenar o ZIP **fora do GitHub** e fora de pastas públicas, com acesso restrito e proteção contra perda. O arquivo contém informações sensíveis. Registrar data, tamanho, origem e identificador do deployment.
5. Criar **outro deployment descartável**, vazio, sem integrações comerciais nem clientes. Confirmar visualmente o destino.
6. Nesse deployment descartável, restaurar **sem `--prod` e sem `--replace`**:
   ```bash
   bunx convex import --deployment NOME_DO_DEPLOYMENT_DESCARTAVEL backup-piloto.zip
   ```
   Importações preservam os IDs dos documentos de snapshots quando aceitas pelo Convex. Nunca usar um deployment com dados existentes nesse ensaio.
7. Verificar no dashboard do **descartável**: organizações, clientes fictícios, agenda, vendas, caixa, vínculos de arquivos e total de registros. Reinstalar código/configuração aplicável separadamente, quando necessário. Registrar resultado e tempo total de recuperação.
8. Não usar o backup para migrar contas reais entre ambientes antes de validar autenticação, identificadores e implicações LGPD.

## 3. Rotina operacional após liberar o piloto

- Antes de deploys e mudanças de schema: gerar snapshot ZIP e confirmar sua guarda segura.
- Enquanto não houver backup automático: responsável nomeado, rotina manual com frequência documentada e registro de execução. Não prometer recuperação de dados mais recente que o último snapshot.
- Executar teste de restauração periódica em ambiente descartável.
- Arquivar com proteção adequada e apagar cópias antigas conforme política de retenção e LGPD.
- Verificar custos, limites do plano, retenção e necessidade de armazenamento de arquivos. Não adicionar ZIP, secrets ou dados de clientes em commits, issues ou conversas.

**Limite de custos:** a documentação oficial do Convex informa que backups periódicos gerenciados exigem plano **Pro**; backups manuais ficam disponíveis no plano Free/Starter com limites (por exemplo, no máximo dois backups armazenados por deployment, retenção de sete dias). Uma exportação ZIP guardada externamente exige proteção e controle de acesso.

## 4. Restauração em emergência — cuidado obrigatório

Restaurar ou importar com `--replace` / `--replace-all` pode **destruir dados existentes**. **Não executar** comandos destrutivos no deployment comercial sem confirmação formal, snapshot imediatamente anterior, plano de rollback e janela de manutenção. O procedimento acima é **somente para ensaio no deployment descartável vazio**.

## Referências oficiais (verificar antes da execução)

- https://docs.convex.dev/database/backup-restore
- https://docs.convex.dev/cli/reference/export
- https://docs.convex.dev/cli/reference/import
- https://docs.convex.dev/database/import-export/import

**GO/NO-GO:** criar o documento e exportar ZIP não comprova restauração. Só marcar o requisito de recuperação como concluído depois do ensaio real bem-sucedido e registrado.

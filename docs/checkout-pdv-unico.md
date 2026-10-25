# Barber OS — cobrança exclusiva no PDV

## Regra de negócio

- Agenda = agendamentos, confirmação, início, falta e cancelamento.
- Botão **Cobrar no PDV** leva para `/app/pdv?appointmentId=<id>` e pré-carrega cliente, barbeiro e serviço com preço do agendamento.
- PDV registra a venda e, **na mesma transação Convex**, marca o agendamento como `concluido`, `pago` e vincula `saleId`.
- `appointments.complete` permanece apenas como endpoint legado que devolve erro e **não gera venda**. Clientes antigos não podem usar essa rota para duplicar lançamentos.
- `recordSale` valida organização, estado e unicidade do agendamento, vínculo de cliente/barbeiro, serviço obrigatório (uma vez) e preço acordado.
- Índice `sales.by_org_appointment` permite detectar vendas legadas vinculadas mesmo se `appointment.saleId` estiver vazio.
- Outras vendas avulsas no PDV continuam possíveis e não são confundidas com cobranças de agendamentos.

## Observações

Uma venda avulsa manual sem `appointmentId` não é necessariamente duplicidade (um cliente pode contratar outro serviço); o backend só garante unicidade de **venda vinculada ao mesmo agendamento**. Registros duplicados históricos não são excluídos nem conciliados automaticamente. Verificar eventuais duplicatas antigas antes de ajustar relatórios financeiros.

Executar CI, `bun run test:backend`, smoke do navegador e homologação manual (Agenda → PDV → finalizar → Agenda mostra concluído → tentar novamente) antes de liberar a alteração. Atualizar Convex Development cloud apenas após PR integrado.

# 0006 — Agenda de recebíveis, estornos e repasses

- Status: aceita
- Data: 2026-10-21
- Relacionadas: ADR 0001 (trilhos simulados), ADR 0002 (uma transação por mudança de dinheiro), ADR 0004 (convenções do ledger)

## Contexto

Até aqui o dinheiro só entrava: o líquido de cada pagamento ficava em `merchant:<id>:pending` e parava ali. Um PSP precisa de mais três coisas:

- dizer **quando** esse dinheiro fica disponível;
- devolver dinheiro ao pagador (**estorno**);
- pagar o lojista (**repasse**).

Estorno e repasse são as primeiras saídas de dinheiro do sistema.

## Decisão

**Agenda de recebíveis**
- Cada pagamento concluído gera, na mesma transação que credita `merchant:pending`, os recebíveis que dizem quando esse valor passa para `merchant:available`.
  - Pix: D+0.
  - Cartão: D+30 **por parcela**, como no mercado brasileiro sem antecipação. Uma compra em 3× vira três recebíveis, em 30, 60 e 90 dias, e os centavos que sobram da divisão vão para a primeira parcela.
- Um job libera os recebíveis vencidos, com um lançamento `pending → available` para cada um.
- Invariante: o saldo de `merchant:pending` é sempre igual à soma do que falta liberar na agenda.

**Saídas de dinheiro registram a intenção antes de chamar o trilho**
1. Numa transação, o valor sai do saldo do lojista e vai para uma conta em trânsito: `refund-in-transit` ou `payout-in-transit`.
2. Fora da transação, o trilho é chamado: devolução Pix, estorno no adquirente ou envio de Pix. A chave de idempotência é o id do estorno ou do repasse.
3. Numa segunda transação, a resposta é aplicada:
   - **sucesso:** sai da conta em trânsito para o caixa (`pix-settlement` ou `acquirer-receivable`);
   - **recusa:** um lançamento de **compensação** desfaz exatamente a intenção. Nada é apagado.
4. Se o trilho não responder, a saída fica `pending` e um job tenta de novo com a mesma chave.

**Estornos**
- O PSP **fica com a taxa**, como a Stripe faz hoje: o lojista devolve o valor cheio.
- O valor sai primeiro dos recebíveis **ainda não liberados** daquele pagamento, começando pelas parcelas mais distantes, e o resto sai do saldo disponível.
- O saldo disponível **pode ficar negativo**. Nesse caso o lojista deve ao PSP, e os repasses ficam bloqueados até o saldo voltar a cobrir o valor pedido.
- Estorno parcial mantém o pagamento `succeeded`, com `amountRefunded`. Estorno total leva o pagamento a `refunded`.
- O valor é reservado no pagamento quando o estorno começa, com o pagamento travado. Assim dois estornos simultâneos nunca somam mais do que foi pago.

**Repasses**
- São sob demanda (`POST /v1/payouts`) e só do saldo **disponível**, para a chave Pix que o lojista cadastra em `PATCH /v1/account`.
- A chave é validada no formato do DICT, inclusive os dígitos verificadores de CPF e CNPJ.
- Um lock por lojista serializa os repasses, para o mesmo saldo nunca ser sacado duas vezes.

## Consequências

- O lojista vê a agenda em `GET /v1/receivables` e o saldo dividido entre `pending` e `available`.
- Antecipação de recebíveis, repasse automático e taxa de repasse ficam para depois. A estrutura comporta: antecipar é liberar um recebível antes da data, cobrando uma taxa.
- Trocar a chave de repasse é uma operação sensível, porque quem tiver a `sk_` pode desviar repasses. Um PSP real exigiria confirmação fora de banda.

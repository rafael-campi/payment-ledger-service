# 0004 — Convenções do ledger: centavos, sinais e idempotência

- Status: aceita
- Data: 2026-10-21

## Decisão

- **Valores** são inteiros na menor unidade da moeda (centavos para BRL). Nunca há float nem decimal em string. A moeda é um código ISO 4217 de 3 letras.
- **Sinais:** positivo é débito e negativo é crédito. Toda transação contábil tem pelo menos dois lançamentos, nenhum com valor zero, todos na mesma moeda, e a soma dá exatamente 0.
- **Append-only:** lançamentos e transações contábeis nunca são alterados nem removidos. O banco reforça isso com triggers que rejeitam `UPDATE` e `DELETE`. Uma correção é uma nova transação contábil.
- **Idempotência no ledger:** o par `(source, externalReference)` é único. Se a mesma transação for postada de novo, o ledger devolve a já existente. Se o par se repetir com conteúdo diferente, o post é rejeitado.
- **Idempotência na API:** toda escrita HTTP exige o cabeçalho `Idempotency-Key`, com a semântica da Stripe:
  - mesma chave e mesmo corpo: devolve a resposta gravada;
  - mesma chave e corpo diferente: 422;
  - requisição ainda em andamento: 409.
- **Saldos** nunca são gravados. São sempre derivados da soma dos lançamentos.

## Exemplo

Pix de R$100 recebido para o lojista 7, com MDR de 0,99%:

| Conta | Valor |
|---|---|
| `pix-settlement` | +10000 |
| `merchant:7:pending` | −9901 |
| `fee-revenue` | −99 |

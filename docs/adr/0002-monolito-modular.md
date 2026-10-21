# 0002 — Monólito modular; só o cofre de cartões é isolado

- Status: aceita
- Data: 2026-10-21

## Contexto

O PSP tem vários contextos: Merchants, Payments, Pix, Card, Card Vault, Ledger, Settlement e Webhooks. Separá-los em serviços parece natural, mas quase toda mudança relevante de estado mexe em dinheiro.

Quando um Pix é confirmado, três coisas precisam acontecer juntas: o pagamento muda de status, o ledger recebe a transação contábil e a outbox recebe o evento para o lojista. Se acontecer só uma ou duas delas, o resultado é dinheiro registrado sem pagamento ou pagamento sem dinheiro.

## Decisão

- Todos os contextos vivem em `payment-ledger-service`, um módulo NestJS por contexto, com o mesmo banco Postgres.
- Os módulos conversam só por casos de uso exportados, nunca pelas tabelas uns dos outros.
- Mudanças que envolvem dinheiro rodam em **uma única transação de banco**: estado do pagamento, lançamentos e outbox.
- O **Card Vault** é a exceção planejada: o PAN fica em um módulo próprio, criptografado, e nunca é logado nem sai dele. Quando o cartão for implementado, o cofre pode virar um processo separado, para limitar o escopo PCI.

## Consequências

- Não há sagas nem consistência eventual dentro do PSP.
- A separação em serviços continua possível depois, porque as fronteiras entre módulos já existem.

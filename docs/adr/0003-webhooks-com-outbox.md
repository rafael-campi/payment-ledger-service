# 0003 — Eventos para lojistas por webhook, via transactional outbox

- Status: aceita
- Data: 2026-10-21

## Contexto

Pagamentos são assíncronos: um Pix pode ser pago minutos depois de criado, ou nunca. O lojista precisa saber quando o pagamento termina, e o aviso não pode se perder nem chegar como fato novo duas vezes.

## Decisão

- O lojista recebe os eventos por **callback HTTP** (webhook) na URL que cadastrou. Por enquanto não há broker de mensagens.
- Eventos: `payment.pending`, `payment.succeeded`, `payment.failed`, `payment.expired`, `payment.canceled`, `refund.succeeded` e `payout.paid`.
- Cada evento é gravado na tabela de outbox **na mesma transação** que muda o estado, como define a ADR 0002. Um despachante lê a outbox e entrega os eventos.
- A entrega é assinada no cabeçalho `PSP-Signature: t=<unix>,v1=<hex(HMAC-SHA256(segredo, "<t>.<corpo>"))>`.
- Em caso de falha, o despachante tenta de novo com backoff exponencial. A garantia é de pelo menos uma entrega, e o lojista deduplica pelo `id` do evento.
- O lojista pode reconciliar a qualquer momento com `GET /v1/payments/:id`.

## Consequências

- O lojista precisa de um endpoint público que verifica a assinatura e trata cada evento de forma idempotente.
- Se aparecer um terceiro consumidor dos eventos, vale reavaliar o uso de um broker (RabbitMQ).

# payment-ledger-service

PSP (gateway de pagamento) da Loja Prateleira: API para lojistas, Pix e cartão sobre trilhos simulados, e um ledger de partidas dobradas como fonte da verdade do dinheiro.

As decisões de arquitetura estão em [`docs/adr/`](docs/adr/). As regras de domínio estão em [`copilot_prompt.md`](copilot_prompt.md) e as rotas em [`routes.http`](routes.http).

## Rodando

Pré-requisitos: Node.js 22+, pnpm e Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres   # Postgres de dev na porta 5433
pnpm run migration:run
pnpm run start:dev              # http://localhost:3001
```

As portas 3000, 5432 e 5434 ficam livres para o e-commerce-RF.

## Primeiro lojista

Quem opera o PSP cadastra lojistas com o token da plataforma (`PLATFORM_ADMIN_TOKEN` no `.env`):

```bash
curl -X POST localhost:3001/platform/merchants \
  -H "Authorization: Bearer dev-platform-token-troque-em-producao" \
  -H "Idempotency-Key: onboard-loja-1" \
  -H "Content-Type: application/json" \
  -d '{"name": "Loja Prateleira"}'
```

A resposta traz a chave secreta (`sk_test_…`) e a publicável (`pk_test_…`) **só dessa vez**: o PSP guarda apenas o hash. Se repetir a mesma requisição, as chaves voltam mascaradas. Se perder a chave secreta, cadastre o lojista de novo em dev.

O lojista usa a chave secreta em `/v1/*` (`Authorization: Bearer sk_test_…`). As rotas estão em [`routes.http`](routes.http).

## Fluxo de um Pix

1. O lojista registra um endpoint de webhook (`POST /v1/webhook_endpoints`) e guarda o segredo `whsec_…`, que só aparece nessa resposta.
2. O lojista cria o pagamento (`POST /v1/payments`) e mostra o `pix.copiaECola` ao cliente. O status começa em `pending` e o evento `payment.pending` é enviado.
3. Em dev, o pagamento do cliente é simulado com `POST /simulator/pix/<txid>/pay`. O PSP lança o Pix no ledger, o pagamento vira `succeeded` e o evento `payment.succeeded` é enviado.
4. Se ninguém pagar até `expiresAt`, o pagamento vira `expired` e o evento `payment.expired` é enviado.

Um Pix com valor diferente do cobrado, ou que chega depois de a cobrança expirar, é registrado na conta `suspense` e não entra no saldo do lojista.

## Fluxo de um cartão

1. O checkout envia o cartão **do navegador** para `POST /v1/tokens` com a chave publicável (`pk_…`) e recebe um `tok_…`. O servidor do lojista nunca vê o número.
2. O servidor do lojista paga com `POST /v1/payments`, `method: "credit_card"` e `card: { token }`. A resposta já traz o resultado:
   - `succeeded`: autorizado e capturado, com o dinheiro lançado no ledger (`acquirer-receivable` / `merchant:pending` / `fee-revenue`);
   - `failed`: recusado, com `failure.code`;
   - `authorized`, quando `capture: false`: depois é preciso chamar `POST /v1/payments/:id/capture`, ou a autorização caduca em 7 dias.
3. Se o adquirente não responder, o pagamento fica `pending`. Um job tenta de novo com a mesma chave de idempotência, e o resultado chega por webhook.

O número do cartão fica só no cofre, criptografado, e é apagado assim que o adquirente responde. A [ADR 0005](docs/adr/0005-cofre-de-cartoes.md) explica as regras. Os cartões de teste estão em [`routes.http`](routes.http): `4242 4242 4242 4242` aprova e `4000 0000 0000 0002` recusa.

Precisa de `VAULT_ENCRYPTION_KEY` no `.env` (`openssl rand -base64 32`); sem ela a aplicação não sobe.

## Agenda, estornos e repasses

As regras estão na [ADR 0006](docs/adr/0006-agenda-estornos-e-repasses.md).

- **Agenda (`GET /v1/receivables`):** o líquido de cada pagamento entra em `pending` e passa para `available` na data do recebível. No Pix isso acontece no mesmo dia (D+0); no cartão, 30 dias depois de cada parcela (D+30). O saldo está em `GET /v1/balance`.
- **Estorno (`POST /v1/refunds`):** pode ser total ou parcial. O PSP fica com a taxa; o valor sai primeiro do que ainda não foi liberado daquele pagamento e depois do saldo disponível, que pode ficar negativo.
- **Repasse (`POST /v1/payouts`):** envia o saldo disponível para a chave Pix cadastrada em `PATCH /v1/account`.

Estornos e repasses passam por uma conta "em trânsito" antes de chamar o trilho. Se o trilho recusar, um lançamento de compensação devolve tudo exatamente como estava; se não responder, um job tenta de novo com a mesma chave de idempotência.

## Reconciliação e suspense

`GET /platform/reconciliation` cruza as fontes de verdade e lista o que não bate. Um job roda a mesma verificação a cada `RECONCILIATION_INTERVAL_MS` e registra no log as verificações que falharam. As verificações são:

- toda transação do ledger soma zero;
- `refund-in-transit` e `payout-in-transit` guardam exatamente os estornos e repasses em andamento;
- o `pending` de cada lojista é igual à sua agenda de recebíveis;
- todo pagamento pago tem seu dinheiro no ledger, e todo crédito de Pix ou cartão pertence a um pagamento ou está em `suspense`;
- o `amountRefunded` de cada pagamento bate com os estornos.

O extrato do banco não entra na conta: com trilhos simulados não existe extrato independente para comparar.

Pix recebidos que não casaram com nenhuma cobrança aparecem em `GET /platform/suspense`, e o operador os devolve ao pagador com `POST /platform/suspense/:endToEndId/return`.

Lançamentos manuais (`POST /ledger/transactions`) não podem usar as origens dos fluxos do PSP nem mexer no `pending` dos lojistas, para que a reconciliação sempre consiga explicar de onde veio cada centavo.

## Verificando um webhook (lado do lojista)

Cada entrega traz o cabeçalho `PSP-Signature: t=<unix>,v1=<hmac>`. Para validar:

1. Calcule `HMAC-SHA256(segredo, "<t>.<corpo cru>")`, sobre o corpo exatamente como chegou, antes de qualquer parse de JSON.
2. Compare com o `v1` usando comparação em tempo constante.
3. Recuse entregas com `t` a mais de 5 minutos do relógio local.

A implementação de referência é a [`verifySignature`](src/webhooks/domain/signature.ts).

A entrega é "pelo menos uma vez": deduplique pelo `id` do evento. Enquanto o endpoint não responder 2xx, o PSP tenta de novo com espera crescente (30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h) e depois desiste. `GET /v1/events` serve para reconciliar o que tiver se perdido.

## Jobs em segundo plano

| Variável | Padrão | O que faz |
|---|---|---|
| `PAYMENTS_EXPIRY_INTERVAL_MS` | 10000 | Expira cobranças vencidas e autorizações não capturadas; retoma cartões e estornos que ficaram pendentes |
| `VAULT_PURGE_INTERVAL_MS` | 60000 | Apaga o número de cartões tokenizados que não foram usados |
| `SETTLEMENT_INTERVAL_MS` | 60000 | Libera recebíveis vencidos e retoma repasses pendentes |
| `RECONCILIATION_INTERVAL_MS` | 3600000 | Roda a reconciliação e registra no log o que não bate |
| `WEBHOOK_DISPATCH_INTERVAL_MS` | 2000 | Envia os webhooks pendentes |

O valor `0` desliga o job; os testes fazem isso e chamam os casos de uso diretamente. Os dois jobs podem rodar em mais de uma instância ao mesmo tempo, porque usam `FOR UPDATE SKIP LOCKED`.

## Docker

O [`Dockerfile`](Dockerfile) gera a imagem de produção, que aplica as migrations pendentes antes de subir. O sistema inteiro, com loja e gateway, sobe pelo `docker-compose.yml` do repositório `api-gateway`.

## Testes

```bash
pnpm test                       # unitários
docker compose up -d dbtest     # Postgres de teste em tmpfs, porta 5435
pnpm run test:e2e
```

Os testes e2e recriam o schema e rodam as migrations, porque os triggers que tornam o ledger append-only e exigem o balanceamento ficam nelas.

## Migrations

O schema é sempre alterado por migration (`synchronize` fica desligado):

```bash
pnpm run migration:run
pnpm run migration:revert
pnpm run migration:show
```

Toda migration nova precisa ser adicionada à lista em `src/database/data-source.ts`.

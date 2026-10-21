# 0001 — PSP próprio, com trilhos simulados

- Status: aceita
- Data: 2026-10-21

## Contexto

A Loja Prateleira (e-commerce-RF) precisa de um gateway de pagamento de verdade, com Pix e cartão de crédito. Em vez de integrar Stripe, Pagar.me ou Mercado Pago, este serviço passa a **ser** o PSP: oferece a mesma API para lojistas, cuida do ciclo de vida do pagamento, das taxas, do saldo e dos repasses, e registra tudo em um ledger de partidas dobradas.

Os PSPs reais dependem de trilhos regulados. No Pix, é preciso participar do SPI, o que exige autorização do Banco Central ou um banco liquidante. No cartão, é preciso um credenciador (Cielo, Rede, Getnet) e certificação PCI-DSS nível 1. Este projeto não tem nenhum dos dois.

## Decisão

- O PSP implementa por dentro tudo o que um PSP faz: lojistas e chaves de API, pagamentos com máquina de estados, Pix, cofre de cartões, autorização e captura, ledger, taxas (MDR), agenda de recebíveis, repasses, estornos e webhooks.
- Os trilhos externos ficam atrás de portas do domínio, `PixRail` e `AcquirerRail`. As únicas implementações são **simuladores**, acessíveis em `/simulator/*` só em ambiente de desenvolvimento.
- O `endToEndId` do Pix e o identificador da autorização no adquirente são as chaves naturais de idempotência dos eventos vindos dos trilhos.
- Os números de cartão de teste seguem o padrão da Stripe: `4242 4242 4242 4242` aprova e `4000 0000 0000 0002` recusa.

## Consequências

- Nenhum dinheiro real circula. Operar com dinheiro real exige trocar os adapters dos trilhos, além de passar por licenciamento e certificação, o que fica fora do escopo.
- A seção "Blockchain" do `copilot_prompt.md` deixa de valer: os trilhos assumem o papel de rede externa de liquidação, com as mesmas regras (assíncrono, intenção registrada antes, compensação em vez de remoção).

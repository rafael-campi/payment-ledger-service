# 0005 — Cofre de cartões: tokenização no navegador, número só criptografado e por pouco tempo

- Status: aceita
- Data: 2026-10-21
- Relacionadas: ADR 0002 (o cofre é o único módulo que vê o número do cartão), ADR 0004 (exceção à regra de `Idempotency-Key`)

## Contexto

Com cartão, o PSP passa a lidar com o número do cartão (PAN), que é o dado mais sensível do sistema. O PCI-DSS exige reduzir ao mínimo onde o PAN aparece e por quanto tempo fica guardado. Já o CVC não pode ser armazenado depois da autorização.

## Decisão

- **Tokenização no navegador:** o checkout do lojista envia o cartão direto ao PSP, em `POST /v1/tokens`, com a chave **publicável** (`pk_`). O servidor do lojista recebe só o token `tok_`. A chave publicável não serve para mais nada.
- **Número só no cofre:** o PAN fica no módulo `vault`, criptografado com AES-256-GCM. O id do token entra como dado associado, então um texto cifrado copiado para outra linha não decifra. A chave vem de `VAULT_ENCRYPTION_KEY`. O cofre não exporta o PAN: quem autoriza no adquirente é o próprio cofre (`AuthorizeWithCardUseCase`), e o módulo de pagamentos recebe só a resposta.
- **CVC:** é validado na tokenização e nunca é guardado.
- **Token:**
  - é de uso único e se prende ao primeiro pagamento que o usa;
  - vale 15 minutos;
  - o PAN é apagado assim que o adquirente responde;
  - o PAN de tokens que expiram sem uso é apagado por um job.
- **Sem `Idempotency-Key` em `/v1/tokens`:** é uma exceção à ADR 0004. O hash da requisição que a idempotência guarda seria um hash do número do cartão, e números de cartão têm pouca entropia, então esse hash se quebra por força bruta. Um token duplicado não move dinheiro e expira sozinho.
- **Erros nunca repetem o número do cartão**, nem os últimos dígitos.

## Consequências

- O lojista fica fora do escopo PCI mais pesado (SAQ A), porque não toca o PAN.
- Perder a `VAULT_ENCRYPTION_KEY` torna ilegíveis os cartões em trânsito. Como nenhum PAN fica guardado por mais de alguns minutos, o impacto é pequeno.
- Em produção, a chave deveria ficar num KMS/HSM, com rotação, e o cofre num processo separado, como prevê a ADR 0002. Fica para quando houver dinheiro real.

/**
 * Pix "copia e cola" payload: EMV QR Code (MPM) as specified in the BCB
 * "Manual de Padrões para Iniciação do Pix". Dynamic charges point to a
 * location URL instead of carrying a Pix key.
 */
export function buildDynamicBrCode(input: {
  location: string; // without scheme, e.g. "pix.example.com/qr/v2/<id>"
  amount: number; // cents
  merchantName: string;
  merchantCity: string;
}): string {
  const payload =
    tlv('00', '01') + // payload format indicator
    tlv('01', '12') + // point of initiation: 12 = single use
    tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('25', input.location)) +
    tlv('52', '0000') + // merchant category code
    tlv('53', '986') + // currency: BRL
    tlv('54', (input.amount / 100).toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', emvText(input.merchantName, 25)) +
    tlv('60', emvText(input.merchantCity, 15)) +
    tlv('62', tlv('05', '***')) + // txid lives in the location for dynamic charges
    '6304'; // CRC field id + length; the CRC covers these 4 chars too

  return payload + crc16(payload);
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as 4 uppercase hex digits. */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(data, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  if (value.length > 99) {
    throw new Error(`EMV field ${id} is longer than 99 characters`);
  }
  return id + value.length.toString().padStart(2, '0') + value;
}

// EMV text fields are plain ASCII: drop accents, keep it short and uppercase
function emvText(value: string, maxLength: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, '')
    .toUpperCase()
    .slice(0, maxLength)
    .trim();
}

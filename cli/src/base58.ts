const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = BigInt(58);

const ALPHABET_MAP = new Map<string, bigint>();
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP.set(ALPHABET[i], BigInt(i));
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  let num = 0n;
  for (const ch of str) {
    const val = ALPHABET_MAP.get(ch);
    if (val === undefined) throw new Error(`Invalid base58 character: ${ch}`);
    num = num * BASE + val;
  }

  const hex = num.toString(16).padStart(2, '0');
  const bytes = new Uint8Array(hex.length / 2 + (hex.length % 2));
  const padded = hex.length % 2 ? '0' + hex : hex;
  for (let i = 0; i < padded.length; i += 2) {
    bytes[i / 2] = parseInt(padded.slice(i, i + 2), 16);
  }

  // Count leading '1's (zero bytes)
  let leadingZeros = 0;
  for (const ch of str) {
    if (ch === '1') leadingZeros++;
    else break;
  }

  if (leadingZeros === 0) return bytes;
  const result = new Uint8Array(leadingZeros + bytes.length);
  result.set(bytes, leadingZeros);
  return result;
}

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  // Count leading zeros
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros++;
    else break;
  }

  let num = 0n;
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }

  let encoded = '';
  while (num > 0n) {
    const rem = num % BASE;
    num = num / BASE;
    encoded = ALPHABET[Number(rem)] + encoded;
  }

  return '1'.repeat(leadingZeros) + encoded;
}

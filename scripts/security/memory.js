
export function zeroize(buffer) {
  if (buffer instanceof ArrayBuffer) {
    buffer = new Uint8Array(buffer);
  }
  if (buffer instanceof Uint8Array) {
    buffer.fill(0);
  } else {
    console.warn('[zeroize] Type non supporté:', typeof buffer);
  }
}

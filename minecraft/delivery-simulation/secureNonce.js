// BDS 1.26.60.6 preflight — no network or delivery activity.
// A cryptographic nonce source must exist before authenticated requests can start.
export function secureNonce32(cryptoProvider) {
  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== "function")
    throw new Error("secure_random_unavailable");
  const bytes = new Uint8Array(16);
  const filled = cryptoProvider.getRandomValues(bytes);
  // Fail closed on broken or nonconforming providers; never fall back to Math.random.
  if (filled !== bytes || !bytes.some(x => x !== 0))
    throw new Error("secure_random_unavailable");
  return Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
}
export function safeTimestamp(now = Date.now) {
  const timestamp = now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 1700000000000)
    throw new Error("clock_unavailable");
  return timestamp;
}

/**
 * Utility to extract a clean URL (http:// or https://) from any string or phrase.
 * Handles URLs embedded inside sentences and strips trailing punctuation (, . ; : ! ? ) ] } " ').
 *
 * Example:
 * Input: "Para me transferir R$ 12,90 pela conta do Nubank ou de outros bancos pelo Pix, entre em https://nubank.com.br/cobrar/b49ns/6ac25bd1-9ac1-4df8-a17c-a47c708950ca,"
 * Output: "https://nubank.com.br/cobrar/b49ns/6ac25bd1-9ac1-4df8-a17c-a47c708950ca"
 */
export function extractUrlFromText(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  let url = match[0];
  // Strip trailing punctuation that might follow the URL in sentence text
  url = url.replace(/[,.;:!?)\]}"'>]+$/, '');

  return url.length > 0 ? url : null;
}

import ipaddr from 'ipaddr.js';

// WHATWG URL şema ve host'u zaten küçük harfe çevirir ve varsayılan portu (80/443) atar.
// Geriye sadece fragment'ı atmak kalır; path ve query olduğu gibi korunur.
export function normalizeUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = '';
  return copy.href;
}

// Sadece literal adresler kontrol edilir. Alan adlarının hangi IP'ye çözüldüğü
// istek anında, worker'da kontrol edilir (DNS rebinding'e karşı).
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  if (!ipaddr.isValid(host)) {
    return false;
  }
  return ipaddr.process(host).range() !== 'unicast';
}

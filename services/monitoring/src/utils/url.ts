import ipaddr from 'ipaddr.js';

export function normalizeUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = '';
  return copy.href;
}

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

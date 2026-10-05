import { request } from 'undici';
import type { CheckErrorCode } from '../repositories/measurements.repository';

const USER_AGENT = 'PingPulse-Monitor/1.0';
const MAX_REDIRECTS = 5;
const BODY_DUMP_LIMIT = 64 * 1024;

const TLS_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export type CheckResult = {
  isUp: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorCode: CheckErrorCode | null;
};

export class HttpChecker {
  constructor(private readonly timeoutMs: number) {}

  // Hata fırlatmaz: her sonuç (başarılı ya da değil) bir CheckResult olarak döner.
  async check(url: string): Promise<CheckResult> {
    // Tek bir sinyal bütün yönlendirme zincirini kapsar. AbortSignal gerçek iptaldir:
    // süre dolunca socket de kapanır, slot ve bağlantı serbest kalır.
    const signal = AbortSignal.timeout(this.timeoutMs);
    const startedAt = performance.now();
    let currentUrl = url;

    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const response = await request(currentUrl, {
          method: 'GET',
          headers: { 'user-agent': USER_AGENT },
          signal,
        });
        const responseTimeMs = Math.round(performance.now() - startedAt);
        // Body okunmadan bırakılır; bırakılmazsa socket havuza dönmez ve bağlantı sızar.
        // dump() hataları yutar: body süre içinde gelmediyse bunu sinyalden anlarız.
        await response.body.dump({ limit: BODY_DUMP_LIMIT, signal });
        if (signal.aborted) {
          return timedOut();
        }

        const location = response.headers.location;
        if (isRedirect(response.statusCode) && typeof location === 'string') {
          currentUrl = new URL(location, currentUrl).href;
          continue;
        }

        const isUp = response.statusCode >= 200 && response.statusCode < 400;
        return {
          isUp,
          statusCode: response.statusCode,
          responseTimeMs,
          errorCode: isUp ? null : 'HTTP_ERROR',
        };
      }
      return { isUp: false, statusCode: null, responseTimeMs: null, errorCode: 'HTTP_ERROR' }; // çok fazla yönlendirme
    } catch (error) {
      if (signal.aborted) {
        return timedOut();
      }
      return { isUp: false, statusCode: null, responseTimeMs: null, errorCode: toErrorCode(error) };
    }
  }
}

function timedOut(): CheckResult {
  return { isUp: false, statusCode: null, responseTimeMs: null, errorCode: 'TIMEOUT' };
}

function isRedirect(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}

// undici'nin kendi iç timeout'ları (örn. bağlantı için varsayılan 10 sn) CHECK_TIMEOUT_MS'den önce dolabilir.
const UNDICI_TIMEOUT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

function toErrorCode(error: unknown): CheckErrorCode {
  const code = (error as { code?: string; cause?: { code?: string } })?.code
    ?? (error as { cause?: { code?: string } })?.cause?.code;

  if (code && UNDICI_TIMEOUT_CODES.has(code)) return 'TIMEOUT';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS_ERROR';
  if (code === 'ECONNREFUSED') return 'CONN_REFUSED';
  if (code && (TLS_ERROR_CODES.has(code) || code.startsWith('ERR_SSL') || code.startsWith('ERR_TLS'))) {
    return 'TLS_ERROR';
  }
  return 'UNKNOWN';
}

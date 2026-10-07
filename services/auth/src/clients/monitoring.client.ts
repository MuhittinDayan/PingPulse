const REQUEST_TIMEOUT_MS = 3000;

export type Plan = 'FREE' | 'PRO' | 'ENTERPRISE';

// monitoring-service'in internal API'si. Sadece servisler arası ortak secret ile çağrılabilir.
export class MonitoringClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
  ) {}

  // Idempotent: aynı istek tekrar gönderilirse sonuç değişmez (upsert).
  async setCompanyPlan(companyId: string, plan: Plan): Promise<void> {
    const url = new URL(`/internal/companies/${encodeURIComponent(companyId)}/plan`, this.baseUrl);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-internal-token': this.internalToken },
      body: JSON.stringify({ plan }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Yönlendirme takip edilmez: edilseydi internal token başka bir adrese de gönderilirdi.
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`monitoring-service responded with ${response.status}`);
    }
  }
}

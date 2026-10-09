const upstreamTimeoutMs = 54_000;
type HealthService = 'identity' | 'gateway' | 'social' | 'ledger';
const validServices = new Set<HealthService>(['identity', 'gateway', 'social', 'ledger']);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const service = new URL(request.url).searchParams.get('service');
  if (service === null || !isHealthService(service))
    return Response.json(
      { status: 'error', code: 'INVALID_READINESS_SERVICE' },
      { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );

  const healthUrl = resolveHealthUrl(service);
  if (!healthUrl) {
    console.error(
      JSON.stringify({
        event: 'readiness_probe',
        service,
        outcome: 'configuration_error',
      }),
    );
    return readinessResponse('starting', service, 500);
  }

  const startedAt = Date.now();
  try {
    const upstream = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });
    const value: unknown = await upstream.json().catch(() => undefined);
    const expectedUpstreamService = service === 'gateway' ? 'identity' : service;
    const ready =
      upstream.ok &&
      isRecord(value) &&
      value.status === 'ok' &&
      value.service === expectedUpstreamService;

    console.info(
      JSON.stringify({
        event: 'readiness_probe',
        service,
        outcome: ready ? 'ready' : 'not_ready',
        upstreamStatus: upstream.status,
        elapsedMs: Date.now() - startedAt,
      }),
    );
    return readinessResponse(ready ? 'ok' : 'starting', service, ready ? 200 : 503);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'readiness_probe',
        service,
        outcome:
          error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error',
        elapsedMs: Date.now() - startedAt,
      }),
    );
    return readinessResponse('starting', service, 503);
  }
}

function resolveHealthUrl(service: HealthService): string | undefined {
  try {
    const configured = {
      identity: process.env.EQUA_IDENTITY_HEALTH_URL,
      gateway: process.env.EQUA_GATEWAY_URL,
      social: process.env.EQUA_SOCIAL_HEALTH_URL,
      ledger: process.env.EQUA_LEDGER_HEALTH_URL,
    }[service];
    if (!configured) return undefined;

    const url = new URL(configured);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.internal')
    )
      return undefined;
    if (service === 'gateway')
      return url.pathname === '/' ? new URL('/health', url).toString() : undefined;
    return url.pathname === '/health' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function readinessResponse(
  status: 'ok' | 'starting',
  service: HealthService,
  httpStatus: number,
): Response {
  return Response.json(
    { status, service },
    {
      status: httpStatus,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}

function isHealthService(service: string): service is HealthService {
  return validServices.has(service as HealthService);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

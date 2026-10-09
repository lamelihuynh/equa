const upstreamTimeoutMs = 54_000;
const validServices = new Set(['identity', 'gateway']);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const service = new URL(request.url).searchParams.get('service');
  if (service === null || !validServices.has(service))
    return Response.json(
      { status: 'error', code: 'INVALID_READINESS_SERVICE' },
      { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );

  const serviceName = service === 'identity' ? 'identity' : 'gateway';
  const healthUrl = resolveHealthUrl(serviceName);
  if (!healthUrl) {
    console.error(
      JSON.stringify({
        event: 'readiness_probe',
        service: serviceName,
        outcome: 'configuration_error',
      }),
    );
    return readinessResponse('starting', serviceName, 500);
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
    const ready =
      upstream.ok && isRecord(value) && value.status === 'ok' && value.service === 'identity';
    const status = ready
      ? 200
      : upstream.status >= 400 && upstream.status < 500
        ? upstream.status
        : 503;

    console.info(
      JSON.stringify({
        event: 'readiness_probe',
        service: serviceName,
        outcome: ready ? 'ready' : 'not_ready',
        upstreamStatus: upstream.status,
        elapsedMs: Date.now() - startedAt,
      }),
    );
    return readinessResponse(ready ? 'ok' : 'starting', serviceName, status);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'readiness_probe',
        service: serviceName,
        outcome:
          error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error',
        elapsedMs: Date.now() - startedAt,
      }),
    );
    return readinessResponse('starting', serviceName, 503);
  }
}

function resolveHealthUrl(service: 'identity' | 'gateway'): string | undefined {
  try {
    const configured =
      service === 'identity' ? process.env.EQUA_IDENTITY_HEALTH_URL : process.env.EQUA_GATEWAY_URL;
    if (!configured) return undefined;

    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.search || url.hash) return undefined;
    if (service === 'identity') return url.pathname === '/health' ? url.toString() : undefined;
    return url.pathname === '/' ? new URL('/health', url).toString() : undefined;
  } catch {
    return undefined;
  }
}

function readinessResponse(
  status: 'ok' | 'starting',
  service: 'identity' | 'gateway',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

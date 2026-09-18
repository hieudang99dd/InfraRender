// In-memory rate limiting for the single Next.js production container.
// If InfraRender is horizontally scaled later, replace this with a shared store such as Redis.

type RateRule = {
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const TEN_MINUTES = 10 * 60 * 1000;
const RULES: Record<string, RateRule> = {
  "upload-image": { limit: 60, windowMs: TEN_MINUTES },
  "generate-prompt": { limit: 120, windowMs: TEN_MINUTES },
  "render-image": { limit: 12, windowMs: TEN_MINUTES },
  "render-status/check": { limit: 30, windowMs: TEN_MINUTES },
  "files:DELETE": { limit: 120, windowMs: TEN_MINUTES },
};

const buckets = new Map<string, Bucket>();

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function ruleKey(request: Request, path: string) {
  if (request.method === "DELETE" && path.startsWith("files/")) return "files:DELETE";
  return path;
}

export function checkRateLimit(request: Request, path: string) {
  const keyName = ruleKey(request, path);
  const rule = RULES[keyName];
  if (!rule) return null;

  const now = Date.now();
  const key = `${keyName}:${clientAddress(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return null;
  }

  if (current.count >= rule.limit) {
    return {
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;

  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return null;
}

export function resetRateLimitsForTests() {
  buckets.clear();
}

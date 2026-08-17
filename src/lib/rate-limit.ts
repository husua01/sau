import type { NextRequest } from "next/server";

const hits = new Map<string, number[]>();
let lastPrune = Date.now();

// 점진적 prune(MAX_PRUNE_PER_CALL)은 호출당 지연 시간만 제한할 뿐, 정리 속도보다
// 서로 다른 키가 더 빨리 들어오면 전체 크기는 계속 늘어날 수 있다. 절대 상한을 두어
// 그 경우에도 메모리가 무한정 커지지 않도록 가장 오래된 키부터 밀어낸다.
const MAX_TRACKED_KEYS = 20_000;

export function rateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }

  if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) {
    const oldestKey = hits.keys().next().value;
    if (oldestKey !== undefined) hits.delete(oldestKey);
  }

  arr.push(now);
  hits.set(key, arr);

  // 매 윈도우마다 한 번씩, 호출당 스캔량을 제한하며 완전히 만료된 키를 정리한다.
  // (남은 키는 다음 prune 주기에 마저 정리된다.)
  const MAX_PRUNE_PER_CALL = 1000;
  if (now - lastPrune >= windowMs) {
    let scanned = 0;
    for (const [k, v] of hits) {
      if (now - v[v.length - 1] >= windowMs) hits.delete(k);
      if (++scanned >= MAX_PRUNE_PER_CALL) break;
    }
    lastPrune = now;
  }
  return true;
}

// X-Forwarded-For는 "client, proxy1, proxy2, ..." 형태로 각 프록시가 직전 호출자의 주소를 덧붙인다.
// 맨 앞 값은 클라이언트가 임의로 위조해 보낼 수 있으므로, 우리 인프라 바로 앞단의 리버스 프록시가
// 덧붙인 마지막 값만 신뢰한다 (단일 리버스 프록시 뒤에서 운영한다는 전제).
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  const hops = forwardedFor.split(",").map((h) => h.trim());
  return hops[hops.length - 1] || "unknown";
}

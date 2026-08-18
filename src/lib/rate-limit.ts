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

// 지갑 주소당 누적 업로드 바이트 상한.
//
// Arweave 업로드 비용은 운영자 지갑(ARWEAVE_KEY)이 전액 대납하는데, upload_shared_content에는
// 결제도, 주소별 할당량도, "이 업로드가 실제 민팅으로 이어지는가"에 대한 바인딩도 없다.
// 즉 지갑 하나만 있으면 누구나 운영자 돈으로 영구 저장을 뽑아갈 수 있고, Arweave는 환불도
// 삭제도 불가능하다. 방어가 IP 레이트리밋(10회/분)뿐이면 IP 하나로 분당 500MB까지 태울 수 있다.
//
// ponytail: 지갑 주소는 무료로 무한 생성 가능하므로 이것만으로 완전히 막히지는 않는다.
//   근본 해결은 사용자가 자기 Arweave 지갑으로 직접 결제하는 것(ArConnect 통합)이고,
//   그 전까지의 차선은 공유 저장소(Upstash/Vercel KV) 기반 전역 일일 상한이다.
//   여기 인메모리 Map은 서버리스 인스턴스별로만 유효하다 — rateLimit()과 같은 한계.
const quotaUsage = new Map<string, { bytes: number; resetAt: number }>();

export function byteQuota(
  key: string,
  bytes: number,
  limitBytes: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = quotaUsage.get(key);

  if (!entry || now >= entry.resetAt) {
    if (bytes > limitBytes) return false;
    // 창이 지난 항목은 어차피 덮어쓰므로, 여기서 만료된 다른 키들도 함께 정리한다.
    for (const [k, v] of quotaUsage) {
      if (now >= v.resetAt) quotaUsage.delete(k);
    }
    quotaUsage.set(key, { bytes, resetAt: now + windowMs });
    return true;
  }

  if (entry.bytes + bytes > limitBytes) return false;
  entry.bytes += bytes;
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

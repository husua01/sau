// /api/upload-content-blob(토큰 발급)와 /api/unified(다운로드 후 검증)가
// 같은 한도를 봐야 한다. 따로 두면 한쪽만 바꿨을 때 Blob 업로드는 성공하고
// 그 다음 크기 검증에서만 계속 실패하는 상황이 생긴다.
export const MAX_SHARED_CONTENT_BYTES = 50 * 1024 * 1024; // 50MB

// 지갑 주소당 24시간 누적 업로드 상한. Arweave 비용을 운영자가 전액 대납하므로
// 파일 1건 크기만 제한해서는 반복 업로드로 잔액을 소진시키는 걸 막을 수 없다.
// 정상 사용(하루 4건 풀사이즈 민팅)에는 넉넉하고, 지갑 하나가 태울 수 있는 상한은 고정된다.
export const MAX_CONTENT_BYTES_PER_ADDRESS_PER_DAY = envBytes(
  "MAX_CONTENT_MB_PER_ADDRESS_PER_DAY",
  200,
);

// 주소당 상한만으로는 부족하다: 지갑은 무료로 무한 생성되므로 공격자는 주소를 갈아타며
// 상한을 몇 번이든 다시 받을 수 있다. 운영자 AR 잔액이 하루에 잃을 수 있는 최대치를
// 고정하려면 전체 합계에도 상한이 필요하다. 이 값에 도달하면 정상 사용자도 막히지만,
// 지갑이 통째로 비는 것보다는 낫다(장애 > 파산).
export const MAX_CONTENT_BYTES_GLOBAL_PER_DAY = envBytes(
  "MAX_CONTENT_MB_GLOBAL_PER_DAY",
  2048,
);

export const CONTENT_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

function envBytes(name: string, defaultMb: number): number {
  const mb = Number(process.env[name]);
  return (Number.isFinite(mb) && mb > 0 ? mb : defaultMb) * 1024 * 1024;
}

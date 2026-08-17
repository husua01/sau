// /api/upload-content-blob(토큰 발급)와 /api/unified(다운로드 후 검증)가
// 같은 한도를 봐야 한다. 따로 두면 한쪽만 바꿨을 때 Blob 업로드는 성공하고
// 그 다음 크기 검증에서만 계속 실패하는 상황이 생긴다.
export const MAX_SHARED_CONTENT_BYTES = 50 * 1024 * 1024; // 50MB

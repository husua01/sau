// Arweave 직접 업로드 (arweave-js 사용)

type ArweaveConfig = {
  host: string;
  port: number;
  protocol: "http" | "https";
  gatewayHost: string;
  gatewayProtocol: "http" | "https";
  jwk: Record<string, any>;
};

// Arweave mainnet만 지원한다. 예전 testnet 기본 호스트(testnet.redstone.tools)는
// 수년 전 폐쇄된 게이트웨이라, 기본 설정에서는 업로드가 항상 실패로 끝나는
// 문제가 있었다. 테스트가 필요하면 ARWEAVE_HOST 등으로 대체 게이트웨이를 지정한다.
function resolveArweaveConfig(): ArweaveConfig {
  const host = process.env.ARWEAVE_HOST || "arweave.net";
  const port = Number(process.env.ARWEAVE_PORT) || 443;
  const protocol = (process.env.ARWEAVE_PROTOCOL || "https") as
    "http" | "https";

  const gatewayHost = process.env.ARWEAVE_GATEWAY_HOST || host;
  const gatewayProtocol = (process.env.ARWEAVE_GATEWAY_PROTOCOL || protocol) as
    "http" | "https";

  const keyString = process.env.ARWEAVE_KEY;
  if (!keyString) {
    throw new Error("ARWEAVE_KEY가 설정되지 않았습니다.");
  }

  let jwk: Record<string, any>;
  try {
    jwk = JSON.parse(keyString);
  } catch (error) {
    throw new Error(
      "ARWEAVE_KEY 파싱에 실패했습니다. JSON 형식인지 확인하세요.",
    );
  }

  return {
    host,
    port,
    protocol,
    gatewayHost,
    gatewayProtocol,
    jwk,
  };
}

async function createArweaveClient() {
  const config = resolveArweaveConfig();
  const Arweave = (await import("arweave")).default;

  const arweave = Arweave.init({
    host: config.host,
    port: config.port,
    protocol: config.protocol,
  });

  const gatewayUrl = `${config.gatewayProtocol}://${config.gatewayHost}`;

  return {
    arweave,
    jwk: config.jwk,
    gatewayUrl,
  };
}

function ensureServerSide() {
  if (typeof window !== "undefined") {
    throw new Error("Arweave 업로드는 서버 사이드에서만 실행할 수 있습니다.");
  }
}

// 문자열은 무조건 UTF-8 바이트 그대로 저장한다. "base64처럼 생겼으면 디코딩한다"는
// 휴리스틱이 있었는데, 이 함수에 실제로 들어오는 유일한 페이로드인 Lit 암호문이
// 정확히 표준 base64 문자열이라 항상 오탐했다 — 서버가 암호문을 디코딩해 바이너리로
// 저장하고, 클라이언트는 그걸 res.text()로 읽어 깨진 UTF-8을 받으면서 모든 콘텐츠가
// 영구히 복호화 불가능해졌다. 저장한 문자열이 그대로 돌아오는 것이 이 함수의 계약이다.
// (호출부의 크기 검사도 Buffer.byteLength(content, "utf8") 기준이라 이쪽과 일치한다.)
export function normalizeDataPayload(data: string | Buffer): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
}

// Arweave에 데이터 업로드
export async function uploadToArweave(
  data: string | Buffer,
  tags?: Array<{ name: string; value: string }>,
): Promise<{ id: string; url: string }> {
  try {
    ensureServerSide();

    console.log("📤 Arweave 업로드 시작...");

    const normalizedData = normalizeDataPayload(data);
    const dataSize = normalizedData.length;
    console.log(`📊 데이터 크기: ${dataSize} bytes`);

    const { arweave, jwk, gatewayUrl } = await createArweaveClient();

    const walletAddress = await arweave.wallets.jwkToAddress(jwk as any);
    console.log(`👛 Arweave 지갑: ${walletAddress}`);

    try {
      const balance = await arweave.wallets.getBalance(walletAddress);
      const arBalance = arweave.ar.winstonToAr(balance);
      console.log(`💰 AR 잔액: ${arBalance} AR`);
    } catch (balanceError) {
      console.warn("ℹ️ 잔액 확인 실패 (계속 진행):", balanceError);
    }

    console.log("📝 Arweave 트랜잭션 생성 중...");
    const transaction = await arweave.createTransaction(
      { data: normalizedData },
      jwk as any,
    );

    // 태그 추가
    const defaultTags = [
      { name: "Content-Type", value: "application/octet-stream" },
      { name: "App-Name", value: "SAU-Platform" },
    ];
    const allTags = [...defaultTags, ...(tags || [])];

    for (const tag of allTags) {
      transaction.addTag(tag.name, tag.value);
    }

    console.log(`🏷️  태그: ${allTags.length}개 추가`);
    // 트랜잭션 서명
    await arweave.transactions.sign(transaction, jwk as any);
    console.log("✍️ 트랜잭션 서명 완료");

    // 업로드
    console.log("📤 Arweave 네트워크에 업로드 중...");
    const uploader = await arweave.transactions.getUploader(
      transaction,
      normalizedData,
    );
    while (!uploader.isComplete) {
      await uploader.uploadChunk();
      console.log(`⏳ 업로드 진행률: ${uploader.pctComplete}%`);
    }

    console.log(`✅ Arweave 업로드 완료: ${transaction.id}`);
    console.log(`🔗 URL: ${gatewayUrl}/${transaction.id}`);
    console.log(`⏱️  약 5-10분 후 데이터 접근 가능`);

    return {
      id: transaction.id,
      url: `${gatewayUrl}/${transaction.id}`,
    };
  } catch (error) {
    console.error("❌ Arweave 업로드 실패:", error);
    throw error;
  }
}

// Arweave에서 데이터 조회
export async function fetchFromArweave(arweaveId: string): Promise<string> {
  try {
    console.log(`📥 Arweave 데이터 조회: ${arweaveId}`);

    const urls = [
      `https://arweave.net/${arweaveId}`,
      `https://gateway.irys.xyz/${arweaveId}`,
    ];

    for (const url of urls) {
      try {
        console.log(`🔍 조회 시도: ${url}`);
        const response = await fetch(url, { cache: "no-store" });

        if (response.ok) {
          const data = await response.text();
          console.log(`✅ 데이터 조회 성공: ${data.length} bytes`);
          return data;
        }
      } catch (fetchError) {
        continue;
      }
    }

    throw new Error("데이터를 찾을 수 없습니다");
  } catch (error) {
    console.error("❌ Arweave 데이터 조회 실패:", error);
    throw new Error("데이터 조회에 실패했습니다.");
  }
}

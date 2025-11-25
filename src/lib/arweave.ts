// Arweave 직접 업로드 (arweave-js 사용)

import crypto from 'crypto';

type ArweaveConfig = {
  mode: 'mainnet' | 'testnet';
  host: string;
  port: number;
  protocol: 'http' | 'https';
  gatewayHost: string;
  gatewayProtocol: 'http' | 'https';
  jwk: Record<string, any>;
};

function resolveArweaveConfig(): ArweaveConfig {
  const modeRaw = (process.env.ARWEAVE_MODE || 'testnet').toLowerCase();
  const mode: 'mainnet' | 'testnet' =
    modeRaw === 'mainnet' ? 'mainnet' : 'testnet';

  const fallbackHost =
    mode === 'mainnet' ? 'arweave.net' : 'testnet.redstone.tools';
  const fallbackProtocol: 'http' | 'https' = 'https';
  const fallbackPort = 443;

  const host =
    (mode === 'mainnet'
      ? process.env.ARWEAVE_MAINNET_HOST
      : process.env.ARWEAVE_TESTNET_HOST) || fallbackHost;
  const port =
    Number(
      mode === 'mainnet'
        ? process.env.ARWEAVE_MAINNET_PORT
        : process.env.ARWEAVE_TESTNET_PORT,
    ) || fallbackPort;
  const protocol =
    ((mode === 'mainnet'
      ? process.env.ARWEAVE_MAINNET_PROTOCOL
      : process.env.ARWEAVE_TESTNET_PROTOCOL) || fallbackProtocol) as
      | 'http'
      | 'https';

  const gatewayHost =
    process.env.ARWEAVE_GATEWAY_HOST ||
    (mode === 'mainnet'
      ? process.env.ARWEAVE_MAINNET_GATEWAY_HOST
      : process.env.ARWEAVE_TESTNET_GATEWAY_HOST) ||
    host;

  const gatewayProtocol =
    (process.env.ARWEAVE_GATEWAY_PROTOCOL ||
      (mode === 'mainnet'
        ? process.env.ARWEAVE_MAINNET_GATEWAY_PROTOCOL
        : process.env.ARWEAVE_TESTNET_GATEWAY_PROTOCOL) ||
      protocol) as 'http' | 'https';

  const keyString =
    process.env.ARWEAVE_KEY ||
    (mode === 'mainnet'
      ? process.env.ARWEAVE_MAINNET_KEY
      : process.env.ARWEAVE_TESTNET_KEY);

  if (!keyString) {
    throw new Error(
      `ARWEAVE_KEY가 설정되지 않았습니다. ${
        mode === 'mainnet' ? 'ARWEAVE_MAINNET_KEY' : 'ARWEAVE_TESTNET_KEY'
      } 또는 ARWEAVE_KEY 환경 변수를 확인하세요.`,
    );
  }

  let jwk: Record<string, any>;
  try {
    jwk = JSON.parse(keyString);
  } catch (error) {
    throw new Error('ARWEAVE_KEY 파싱에 실패했습니다. JSON 형식인지 확인하세요.');
  }

  return {
    mode,
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
  const Arweave = (await import('arweave')).default;

  const arweave = Arweave.init({
    host: config.host,
    port: config.port,
    protocol: config.protocol,
  });

  const gatewayUrl = `${config.gatewayProtocol}://${config.gatewayHost}`;

  return {
    arweave,
    jwk: config.jwk,
    mode: config.mode,
    gatewayUrl,
  };
}

function ensureServerSide() {
  if (typeof window !== 'undefined') {
    throw new Error('Arweave 업로드는 서버 사이드에서만 실행할 수 있습니다.');
  }
}

function normalizeDataPayload(data: string | Buffer): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data.startsWith('data:')) {
    const [, base64Segment] = data.split(',');
    return Buffer.from(base64Segment, 'base64');
  }

  const isBase64 = /^[A-Za-z0-9+/=]+$/.test(data) && data.length % 4 === 0;
  if (isBase64) {
    try {
      return Buffer.from(data, 'base64');
    } catch {
      // fall through
    }
  }

  return Buffer.from(data, 'utf8');
}

// Arweave에 데이터 업로드
export async function uploadToArweave(
  data: string | Buffer,
  tags?: Array<{ name: string; value: string }>
): Promise<{ id: string; url: string }> {
  try {
    ensureServerSide();

    console.log('📤 Arweave 업로드 시작...');

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
      console.warn('ℹ️ 잔액 확인 실패 (계속 진행):', balanceError);
    }

    console.log('📝 Arweave 트랜잭션 생성 중...');
    const transaction = await arweave.createTransaction(
      { data: normalizedData },
      jwk as any,
    );

    // 태그 추가
    const defaultTags = [
      { name: 'Content-Type', value: 'application/octet-stream' },
      { name: 'App-Name', value: 'SAU-Platform' }
    ];
    const allTags = [...defaultTags, ...(tags || [])];
    
    for (const tag of allTags) {
      transaction.addTag(tag.name, tag.value);
    }
    
    console.log(`🏷️  태그: ${allTags.length}개 추가`);
    // 트랜잭션 서명
    await arweave.transactions.sign(transaction, jwk as any);
    console.log('✍️ 트랜잭션 서명 완료');
    
    // 업로드
    console.log('📤 Arweave 네트워크에 업로드 중...');
    const uploader = await arweave.transactions.getUploader(transaction, normalizedData);
    while (!uploader.isComplete) {
      await uploader.uploadChunk();
      console.log(`⏳ 업로드 진행률: ${uploader.pctComplete}%`);
    }

    console.log(`✅ Arweave 업로드 완료: ${transaction.id}`);
    console.log(`🔗 URL: ${gatewayUrl}/${transaction.id}`);
    console.log(`⏱️  약 5-10분 후 데이터 접근 가능`);
    
    return {
      id: transaction.id,
      url: `${gatewayUrl}/${transaction.id}`
    };
    
  } catch (error) {
    console.error('❌ Arweave 업로드 실패:', error);
    throw error;
  }
}

function createKeyFingerprint(jwk: Record<string, any>): string | null {
  try {
    const serialized = JSON.stringify(jwk);
    return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 24);
  } catch {
    return null;
  }
}

export function getArweaveDebugInfo(): {
  mode: ArweaveConfig['mode'];
  host: string;
  port: number;
  protocol: ArweaveConfig['protocol'];
  gatewayHost: string;
  gatewayProtocol: ArweaveConfig['gatewayProtocol'];
  keyType: string | null;
  keyFingerprint: string | null;
} {
  const config = resolveArweaveConfig();

  return {
    mode: config.mode,
    host: config.host,
    port: config.port,
    protocol: config.protocol,
    gatewayHost: config.gatewayHost,
    gatewayProtocol: config.gatewayProtocol,
    keyType: typeof config.jwk?.kty === 'string' ? config.jwk.kty : null,
    keyFingerprint: createKeyFingerprint(config.jwk),
  };
}

// Arweave에서 데이터 조회
export async function fetchFromArweave(arweaveId: string): Promise<string> {
  try {
    console.log(`📥 Arweave 데이터 조회: ${arweaveId}`);
    
    const urls = [
      `https://arweave.net/${arweaveId}`,
      `https://gateway.irys.xyz/${arweaveId}`
    ];
    
    for (const url of urls) {
      try {
        console.log(`🔍 조회 시도: ${url}`);
        const response = await fetch(url, { cache: 'no-store' });
        
        if (response.ok) {
          const data = await response.text();
          console.log(`✅ 데이터 조회 성공: ${data.length} bytes`);
          return data;
        }
      } catch (fetchError) {
        continue;
      }
    }
    
    throw new Error('데이터를 찾을 수 없습니다');
  } catch (error) {
    console.error('❌ Arweave 데이터 조회 실패:', error);
    throw new Error('데이터 조회에 실패했습니다.');
  }
}

// 업로드 비용 계산
export async function calculateUploadCost(dataSize: number): Promise<{
  arweaveCost: string;
  irysCost: string;
  totalCost: string;
}> {
  try {
    if (typeof window !== 'undefined') {
      throw new Error('Arweave 비용 계산은 서버 환경에서만 가능합니다.');
    }

    const { arweave } = await createArweaveClient();

    const price = await arweave.transactions.getPrice(dataSize);
    const arCost = arweave.ar.winstonToAr(price);
    
    console.log(`💰 실제 비용: ${arCost} AR (${dataSize} bytes)`);
    
    return {
      arweaveCost: arCost,
      irysCost: '0',
      totalCost: arCost
    };
  } catch (error) {
    console.error('❌ Arweave 비용 계산 실패:', error);
    throw error instanceof Error
      ? error
      : new Error('Arweave 비용 계산에 실패했습니다.');
  }
}

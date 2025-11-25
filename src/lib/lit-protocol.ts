// Lit Protocol 암호화 및 복호화 (클라이언트 사이드 전용)
// 동적 import로 빌드 오류 방지

const DEFAULT_LIT_CHAIN =
  process.env.NEXT_PUBLIC_LIT_CHAIN ||
  (process.env.NEXT_PUBLIC_CHAIN_ID === '1' || process.env.NETWORK_MODE === 'mainnet'
    ? 'ethereum'
    : 'sepolia');

// Lit 클라이언트 인스턴스 (싱글톤)
let litNodeClient: any = null;

// Lit 클라이언트 초기화 (브라우저에서만)
export async function initLitClient() {
  // 서버 사이드 체크
  if (typeof window === 'undefined') {
    console.log('[Lit] ⚠️ 브라우저 환경이 아님 - 초기화 건너뜀');
    return null;
  }

  if (litNodeClient && litNodeClient.ready) {
    console.log('[Lit] 이미 초기화된 클라이언트 재사용');
    return litNodeClient;
  }

  try {
    console.groupCollapsed('[Lit] 클라이언트 초기화 준비');
    console.log('[Lit] SDK 로드 시도');
    
    // 동적 import로 Lit Protocol SDK 로드
    const LitJsSdk = await import('@lit-protocol/lit-node-client');

    const rawNetwork =
      process.env.NEXT_PUBLIC_LIT_NETWORK ||
      process.env.LIT_NETWORK ||
      'datil';

    const litNetwork = rawNetwork.trim().length > 0 ? rawNetwork.trim() : 'datil';
    const debugEnabled = (process.env.NODE_ENV || '').toLowerCase() !== 'production';

    console.log('[Lit] 설정값', {
      network: litNetwork,
      debug: debugEnabled,
    });

    litNodeClient = new LitJsSdk.LitNodeClient({
      litNetwork: litNetwork as any,
      debug: debugEnabled,
    });

    console.log('[Lit] LitNodeClient.connect 호출');
    await litNodeClient.connect();
    console.log('[Lit] ✅ 연결 완료');
    console.groupEnd();
    
    return litNodeClient;
  } catch (error) {
    console.error('[Lit] ❌ 초기화 실패:', error);
    console.groupEnd();
    return null;
  }
}

// 접근 제어 조건 생성
export function createAccessControlConditions(
  contractAddress: string,
  tokenId: string | number,
  chain: string = DEFAULT_LIT_CHAIN || 'sepolia'
) {
  return [
    {
      contractAddress,
      standardContractType: 'ERC1155',
      chain,
      method: 'balanceOf',
      parameters: [':userAddress', tokenId.toString()],
      returnValueTest: {
        comparator: '>',
        value: '0'
      }
    }
  ];
}

// 데이터 암호화 (클라이언트 사이드 전용)
export async function encryptWithLit(
  content: string,
  accessControlConditions: any[]
): Promise<{ ciphertext: string; dataToEncryptHash: string } | null> {
  if (typeof window === 'undefined') {
    console.error('[Lit] ❌ encryptWithLit은 브라우저에서만 실행 가능');
    return null;
  }

  try {
    console.groupCollapsed('[Lit] encryptWithLit');
    console.log('[Lit] 접근 제어 조건', accessControlConditions);

    const client = await initLitClient();
    if (!client) {
      throw new Error('Lit 클라이언트 초기화 실패');
    }

    console.log('[Lit] 🔐 암호화 시작');

    // 동적 import로 Lit Protocol SDK 로드
    const LitJsSdk = await import('@lit-protocol/lit-node-client');

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions,
        dataToEncrypt: content,
      },
      client
    );

    console.log('[Lit] ✅ 암호화 성공', {
      ciphertextLength: ciphertext?.length ?? 0,
      dataToEncryptHash,
    });
    console.groupEnd();

    return {
      ciphertext,
      dataToEncryptHash
    };
  } catch (error) {
    console.error('[Lit] ❌ 암호화 실패:', error);
    console.groupEnd();
    throw error;
  }
}

// 데이터 복호화 (클라이언트 사이드 전용)
export async function decryptWithLit(
  ciphertext: string,
  dataToEncryptHash: string,
  accessControlConditions: any[],
  chain: string = DEFAULT_LIT_CHAIN || 'sepolia'
): Promise<string | null> {
  if (typeof window === 'undefined') {
    console.error('[Lit] ❌ decryptWithLit은 브라우저에서만 실행 가능');
    return null;
  }

  try {
    console.groupCollapsed('[Lit] decryptWithLit');
    console.log('[Lit] 입력', {
      hasCiphertext: !!ciphertext,
      dataToEncryptHash,
      chain,
      accessControlConditions,
    });

    const client = await initLitClient();
    if (!client) {
      throw new Error('Lit 클라이언트 초기화 실패');
    }

    console.log('[Lit] 🔓 복호화 시작');

    // 동적 import로 Lit Protocol SDK 로드
    const LitJsSdk = await import('@lit-protocol/lit-node-client');

    // MetaMask를 통한 인증 서명 생성
    const authSig = await LitJsSdk.checkAndSignAuthMessage({
      chain: chain
    } as any);

    const decryptedString = await LitJsSdk.decryptToString(
      {
        accessControlConditions,
        ciphertext,
        dataToEncryptHash,
        authSig,
        chain: chain
      },
      client
    );

    console.log('[Lit] ✅ 복호화 성공', {
      decryptedLength: decryptedString?.length ?? 0,
    });
    console.groupEnd();

    return decryptedString;
  } catch (error) {
    console.error('[Lit] ❌ 복호화 실패:', error);
    console.groupEnd();
    throw error;
  }
}

// 인증 서명 생성 (MetaMask 사용)
export async function generateAuthSig(chain: string = 'sepolia') {
  if (typeof window === 'undefined') {
    throw new Error('이 함수는 클라이언트 사이드에서만 실행할 수 있습니다.');
  }

  try {
    // 동적 import로 Lit Protocol SDK 로드
    const LitJsSdk = await import('@lit-protocol/lit-node-client');
    
    const authSig = await LitJsSdk.checkAndSignAuthMessage({
      chain: chain
    } as any);
    return authSig;
  } catch (error) {
    console.error('[Lit] 인증 서명 생성 실패:', error);
    throw error;
  }
}

// Web Crypto API를 사용한 간단한 암호화 (폴백용)
export async function encryptWithWebCrypto(
  data: string,
  password: string = 'default-password'
): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // 키 생성
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('sau-platform-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // 암호화
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );
  
  return {
    encrypted: new Uint8Array(encrypted),
    iv
  };
}

// Web Crypto API를 사용한 복호화 (폴백용)
export async function decryptWithWebCrypto(
  encryptedData: Uint8Array,
  iv: Uint8Array,
  password: string = 'default-password'
): Promise<string> {
  const encoder = new TextEncoder();
  
  // 키 생성
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('sau-platform-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // 복호화
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

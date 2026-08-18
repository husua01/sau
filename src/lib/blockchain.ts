import { ethers } from "ethers";

// 블록체인 프로바이더 초기화
// RPC URL이 설정되지 않았다고 공개 RPC(rpc.sepolia.org, Alchemy demo 키 등)로
// 조용히 넘어가지 않는다 — 그런 공개 엔드포인트는 우리가 신뢰를 보증할 수 없는
// 제3자이고, 이 프로바이더는 NFT 소유권 확인 등 접근 제어에 쓰이는 온체인 조회의
// 근거가 되므로 누가 응답을 주는지가 중요하다. localhost만 로컬 개발 편의상 예외.
export function getProvider() {
  const networkMode = process.env.NETWORK_MODE || "testnet";

  let rpcUrl: string;
  let network: ethers.Networkish;

  if (networkMode === "testnet" || networkMode === "sepolia") {
    const configured =
      process.env.TESTNET_RPC_URL || process.env.SEPOLIA_RPC_URL;
    if (!configured) {
      throw new Error(
        "TESTNET_RPC_URL 또는 SEPOLIA_RPC_URL이 설정되지 않았습니다.",
      );
    }
    rpcUrl = configured;
    network = {
      name: "sepolia",
      chainId: 11155111,
    };
  } else if (networkMode === "mainnet") {
    const configured = process.env.MAINNET_RPC_URL;
    if (!configured) {
      throw new Error("MAINNET_RPC_URL이 설정되지 않았습니다.");
    }
    rpcUrl = configured;
    network = {
      name: "mainnet",
      chainId: 1,
    };
  } else {
    rpcUrl = process.env.LOCALNET_RPC_URL || "http://localhost:8545";
    network = {
      name: "localhost",
      chainId: 31337,
    };
  }

  console.log(`🔗 블록체인 프로바이더 초기화: ${networkMode} - ${rpcUrl}`);

  // 네트워크 정보를 명시적으로 제공하여 감지 에러 방지. 생성 실패 시 다른
  // 네트워크로 조용히 우회하지 않고 그대로 던진다.
  return new ethers.JsonRpcProvider(rpcUrl, network);
}

// 컨트랙트 인스턴스 생성
export function getContract(contractAddress: string, abi: any) {
  const provider = getProvider();
  return new ethers.Contract(contractAddress, abi, provider);
}

// tokenURI는 mintOwn/setTokenURI로 누구나 임의 값을 써 넣을 수 있는 온체인 데이터다.
// 서버가 그 값을 그대로 fetch하고 응답 본문까지 돌려주면, 아무나 NFT 하나만 민팅해서
// 서버에게 내부 주소(169.254.169.254 메타데이터 서비스, localhost 관리 포트 등)를
// 대신 조회시키고 그 내용을 받아갈 수 있다(SSRF). 이 앱이 실제로 기록하는 tokenURI는
// Pinata가 돌려주는 ipfs:// 하나뿐이므로, 그것과 공개 게이트웨이만 허용한다.
const ALLOWED_METADATA_HOSTS = new Set([
  "ipfs.io",
  "gateway.pinata.cloud",
  "cloudflare-ipfs.com",
  "arweave.net",
]);

export function resolveTokenURI(tokenURI: string): string {
  if (!tokenURI) {
    throw new Error("Token URI가 비어 있습니다.");
  }
  if (tokenURI.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${tokenURI.slice(7)}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(tokenURI);
  } catch {
    throw new Error("Token URI 형식이 올바르지 않습니다.");
  }
  if (
    parsed.protocol !== "https:" ||
    !ALLOWED_METADATA_HOSTS.has(parsed.hostname)
  ) {
    throw new Error(`허용되지 않은 Token URI 호스트입니다: ${parsed.hostname}`);
  }
  return parsed.toString();
}

// Arweave 트랜잭션 ID는 43자 base64url로 고정이다. 이 값도 창작자가 메타데이터에
// 써 넣는 값이라, 그대로 URL에 이어 붙이기 전에 형식을 확인한다.
export function isValidArweaveId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{43}$/.test(id);
}

// NFT 소유권 확인
export async function checkNFTOwnership(
  contractAddress: string,
  tokenId: string,
  userAddress: string,
): Promise<boolean> {
  try {
    // ERC-1155 balanceOf ABI
    const erc1155Abi = [
      {
        inputs: [
          { internalType: "address", name: "account", type: "address" },
          { internalType: "uint256", name: "id", type: "uint256" },
        ],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ];

    const contract = getContract(contractAddress, erc1155Abi);
    const balance = await contract.balanceOf(userAddress, tokenId);

    return balance > 0;
  } catch (error) {
    console.error("NFT 소유권 확인 실패:", error);
    return false;
  }
}


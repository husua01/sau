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


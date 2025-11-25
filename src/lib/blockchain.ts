import { ethers } from 'ethers';

// 블록체인 프로바이더 초기화
export function getProvider() {
  // 환경에 따라 RPC URL 선택
  const networkMode = process.env.NETWORK_MODE || 'testnet';
  
  let rpcUrl: string;
  let network: ethers.Networkish;
  
  if (networkMode === 'testnet' || networkMode === 'sepolia') {
    // 공개 Sepolia RPC 엔드포인트 사용 (fallback)
    rpcUrl = process.env.TESTNET_RPC_URL || 
             process.env.SEPOLIA_RPC_URL || 
             "https://rpc.sepolia.org";
    // Sepolia 네트워크 명시
    network = {
      name: 'sepolia',
      chainId: 11155111
    };
  } else if (networkMode === 'mainnet') {
    rpcUrl = process.env.MAINNET_RPC_URL || 
             "https://eth-mainnet.g.alchemy.com/v2/demo";
    network = {
      name: 'mainnet',
      chainId: 1
    };
  } else {
    rpcUrl = process.env.LOCALNET_RPC_URL || "http://localhost:8545";
    network = {
      name: 'localhost',
      chainId: 31337
    };
  }
  
  console.log(`🔗 블록체인 프로바이더 초기화: ${networkMode} - ${rpcUrl}`);
  
  try {
    // 네트워크 정보를 명시적으로 제공하여 감지 에러 방지
    return new ethers.JsonRpcProvider(rpcUrl, network);
  } catch (error) {
    console.error('❌ Provider 생성 실패:', error);
    // Fallback: Sepolia 공개 RPC
    const fallbackNetwork = {
      name: 'sepolia',
      chainId: 11155111
    };
    return new ethers.JsonRpcProvider("https://rpc.sepolia.org", fallbackNetwork);
  }
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
  userAddress: string
): Promise<boolean> {
  try {
    // ERC-1155 balanceOf ABI
    const erc1155Abi = [
      {
        "inputs": [
          {"internalType": "address", "name": "account", "type": "address"},
          {"internalType": "uint256", "name": "id", "type": "uint256"}
        ],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      }
    ];

    const contract = getContract(contractAddress, erc1155Abi);
    const balance = await contract.balanceOf(userAddress, tokenId);
    
    return balance > 0;
  } catch (error) {
    console.error('NFT 소유권 확인 실패:', error);
    return false;
  }
}

// 지갑 잔액 확인
export async function getWalletBalance(address: string): Promise<string> {
  try {
    const provider = getProvider();
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error('지갑 잔액 확인 실패:', error);
    return '0';
  }
}

// 가스 가격 확인
export async function getGasPrice(): Promise<string> {
  try {
    const provider = getProvider();
    const feeData = await provider.getFeeData();
    return feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : '20';
  } catch (error) {
    console.error('가스 가격 확인 실패:', error);
    return '20'; // 기본값
  }
}

// 트랜잭션 상태 확인
export async function getTransactionStatus(txHash: string): Promise<boolean> {
  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    return receipt ? receipt.status === 1 : false;
  } catch (error) {
    console.error('트랜잭션 상태 확인 실패:', error);
    return false;
  }
}

/**
// 로그 비활성화
const noop = () => {};
console.log = noop;
console.warn = noop;
console.error = noop;

 * 서비스 제공자 지갑 유틸리티
 * 
 * 서버 사이드에서 사용자 대신 트랜잭션을 서명하고 전송하는 기능을 제공합니다.
 * 
 * ⚠️ 보안 경고:
 * - 이 파일은 서버 사이드에서만 사용해야 합니다
 * - 클라이언트에서 절대 import하지 마세요
 * - 개인키가 노출되지 않도록 주의하세요
 * 
 * @see https://docs.ethers.org/v6/api/wallet/
 */

import { ethers, Wallet, JsonRpcProvider } from 'ethers';

/**
 * 서비스 제공자 지갑 정보
 */
export const SERVICE_PROVIDER_CONFIG = {
  address: process.env.SERVICE_PROVIDER_ADDRESS || '0xE7F389B976A72A84e03FbB03206E771C0a955c89',
  privateKey: process.env.SERVICE_PROVIDER_PRIVATE_KEY || '',
};

/**
 * 서비스 제공자 지갑 인스턴스 생성
 * 
 * @param provider - Ethereum provider (선택사항)
 * @returns {Wallet} 서비스 제공자 지갑 인스턴스
 * @throws {Error} 개인키가 설정되지 않은 경우
 * 
 * @example
 * const serviceWallet = getServiceWallet();
 * const balance = await serviceWallet.getBalance();
 */
export function getServiceWallet(provider?: JsonRpcProvider): Wallet {
  if (!SERVICE_PROVIDER_CONFIG.privateKey) {
    throw new Error(
      '❌ 서비스 제공자 개인키가 설정되지 않았습니다. ' +
      'SERVICE_PROVIDER_PRIVATE_KEY 환경 변수를 확인하세요.'
    );
  }

  try {
    const wallet = new Wallet(SERVICE_PROVIDER_CONFIG.privateKey);
    
    if (provider) {
      return wallet.connect(provider);
    }
    
    return wallet;
  } catch (error) {
    throw new Error('서비스 제공자 지갑을 생성할 수 없습니다. 개인키 형식을 확인하세요.');
  }
}

/**
 * 서비스 제공자 지갑의 현재 프로바이더와 함께 반환
 * 
 * @returns {Promise<{wallet: Wallet, provider: JsonRpcProvider}>}
 * 
 * @example
 * const { wallet, provider } = await getServiceWalletWithProvider();
 * const balance = await wallet.getBalance();
 */
export async function getServiceWalletWithProvider(): Promise<{
  wallet: Wallet;
  provider: JsonRpcProvider;
}> {
  const networkMode = process.env.NETWORK_MODE || 'testnet';
  
  let rpcUrl: string;
  let network: ethers.Networkish;
  
  if (networkMode === 'testnet' || networkMode === 'sepolia') {
    rpcUrl = process.env.TESTNET_RPC_URL || 
             process.env.SEPOLIA_RPC_URL || 
             'https://rpc.sepolia.org';
    network = {
      name: 'sepolia',
      chainId: 11155111
    };
  } else if (networkMode === 'mainnet') {
    rpcUrl = process.env.MAINNET_RPC_URL || 
             'https://eth-mainnet.g.alchemy.com/v2/demo';
    network = {
      name: 'mainnet',
      chainId: 1
    };
  } else {
    rpcUrl = process.env.LOCALNET_RPC_URL || 'http://localhost:8545';
    network = {
      name: 'localhost',
      chainId: 31337
    };
  }
  
  const provider = new JsonRpcProvider(rpcUrl, network);
  const wallet = getServiceWallet(provider);
  
  return { wallet, provider };
}

/**
 * 서비스 제공자 지갑 잔액 조회
 * 
 * @returns {Promise<string>} 지갑 잔액 (ETH 단위)
 * 
 * @example
 * const balance = await getServiceWalletBalance();
 */
export async function getServiceWalletBalance(): Promise<string> {
  try {
    const { wallet } = await getServiceWalletWithProvider();
    const balance = await wallet.provider!.getBalance(wallet.address);
    return ethers.formatEther(balance);
  } catch (error) {
    throw error;
  }
}

/**
 * 서비스 제공자 지갑 정보 출력
 * 
 * @returns {Promise<{address: string, balance: string, network: string}>}
 * 
 * @example
 * const info = await getServiceWalletInfo();
 */
export async function getServiceWalletInfo(): Promise<{
  address: string;
  balance: string;
  network: string;
}> {
  try {
    const { wallet, provider } = await getServiceWalletWithProvider();
    const balance = await provider.getBalance(wallet.address);
    const network = await provider.getNetwork();
    
    return {
      address: wallet.address,
      balance: ethers.formatEther(balance),
      network: network.name,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * 컨트랙트 인스턴스 생성 (서비스 제공자 지갑 연결)
 * 
 * @param contractAddress - 컨트랙트 주소
 * @param abi - 컨트랙트 ABI
 * @returns {Promise<ethers.Contract>} 서비스 제공자 지갑이 연결된 컨트랙트 인스턴스
 * 
 * @example
 * const contract = await getContractWithServiceWallet(
 *   '0x123...',
 *   SAU_ABI
 * );
 * await contract.mintNFT(...);
 */
export async function getContractWithServiceWallet(
  contractAddress: string,
  abi: any[]
): Promise<ethers.Contract> {
  try {
    const { wallet } = await getServiceWalletWithProvider();
    return new ethers.Contract(contractAddress, abi, wallet);
  } catch (error) {
    throw error;
  }
}

/**
 * ETH 전송 (서비스 제공자 지갑에서)
 * 
 * @param to - 수신자 주소
 * @param amountInEther - 전송할 ETH 양 (ETH 단위)
 * @returns {Promise<ethers.TransactionResponse>} 트랜잭션 응답
 * 
 * @example
 * const tx = await sendEther('0x123...', '0.1');
 * await tx.wait();
 */
export async function sendEther(
  to: string,
  amountInEther: string
): Promise<ethers.TransactionResponse> {
  try {
    const { wallet } = await getServiceWalletWithProvider();
    
    const tx = await wallet.sendTransaction({
      to,
      value: ethers.parseEther(amountInEther),
    });
    
    return tx;
  } catch (error) {
    throw error;
  }
}

/**
 * 서비스 제공자 지갑이 올바르게 설정되었는지 확인
 * 
 * @returns {Promise<boolean>} 설정 여부
 */
export async function verifyServiceWalletSetup(): Promise<boolean> {
  try {
    
    const info = await getServiceWalletInfo();
    
    
    const balanceNum = parseFloat(info.balance);
    if (balanceNum === 0) {
    }
    
    return true;
  } catch (error) {
    return false;
  }
}


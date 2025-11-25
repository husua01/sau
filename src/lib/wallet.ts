// MetaMask 지갑 연동 유틸리티
export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: string | null;
  balance: string | null;
}

export class WalletManager {
  private static instance: WalletManager;
  private walletState: WalletState = {
    isConnected: false,
    address: null,
    chainId: null,
    balance: null
  };

  private constructor() {}

  public static getInstance(): WalletManager {
    if (!WalletManager.instance) {
      WalletManager.instance = new WalletManager();
    }
    return WalletManager.instance;
  }

  // MetaMask 연결
  public async connectWallet(): Promise<WalletState> {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('MetaMask가 설치되지 않았습니다.');
    }

    try {
      // 계정 요청
      const accounts = await (window as any).ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('사용자가 연결을 거부했습니다.');
      }

      // 체인 ID 확인
      const chainId = await (window as any).ethereum.request({
        method: 'eth_chainId',
      });

      // 잔액 확인
      const balance = await (window as any).ethereum.request({
        method: 'eth_getBalance',
        params: [accounts[0], 'latest'],
      });

      this.walletState = {
        isConnected: true,
        address: accounts[0],
        chainId: chainId,
        balance: this.formatBalance(balance)
      };

      // 체인 변경 감지
      this.setupChainChangeListener();
      
      // 계정 변경 감지
      this.setupAccountChangeListener();

      return this.walletState;
    } catch (error) {
      console.error('MetaMask 연결 실패:', error);
      throw error;
    }
  }

  // 서명 생성
  public async signMessage(message: string, address: string): Promise<string> {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('MetaMask가 설치되지 않았습니다.');
    }

    try {
      const signature = await (window as any).ethereum.request({
        method: 'personal_sign',
        params: [message, address]
      });

      return signature;
    } catch (error) {
      console.error('서명 생성 실패:', error);
      throw error;
    }
  }

  // 트랜잭션 서명 및 전송
  public async sendTransaction(transaction: any): Promise<string> {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('MetaMask가 설치되지 않았습니다.');
    }

    try {
      const txHash = await (window as any).ethereum.request({
        method: 'eth_sendTransaction',
        params: [transaction]
      });

      return txHash;
    } catch (error) {
      console.error('트랜잭션 전송 실패:', error);
      throw error;
    }
  }

  // 네트워크 변경 요청
  public async switchNetwork(chainId: string): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('MetaMask가 설치되지 않았습니다.');
    }

    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }],
      });
    } catch (error) {
      // 네트워크가 추가되지 않았다면 추가 시도
      if ((error as any).code === 4902) {
        await this.addNetwork(chainId);
      } else {
        throw error;
      }
    }
  }

  // 네트워크 추가
  public async addNetwork(chainId: string): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('MetaMask가 설치되지 않았습니다.');
    }

    const networkConfig = this.getNetworkConfig(chainId);

    try {
      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [networkConfig],
      });
    } catch (error) {
      console.error('네트워크 추가 실패:', error);
      throw error;
    }
  }

  // 네트워크 설정 가져오기
  private getNetworkConfig(chainId: string): any {
    const networks = {
      '0x7a69': { // Hardhat Local (31337)
        chainId: '0x7a69',
        chainName: 'Hardhat Local',
        nativeCurrency: {
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['http://127.0.0.1:8545'],
        blockExplorerUrls: [],
      },
      '0xaa36a7': { // Sepolia (11155111)
        chainId: '0xaa36a7',
        chainName: 'Sepolia Testnet',
        nativeCurrency: {
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: [process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo'],
        blockExplorerUrls: ['https://sepolia.etherscan.io'],
      },
      '0x1': { // Ethereum Mainnet
        chainId: '0x1',
        chainName: 'Ethereum Mainnet',
        nativeCurrency: {
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['https://eth-mainnet.g.alchemy.com/v2/demo'],
        blockExplorerUrls: ['https://etherscan.io'],
      }
    };

    return networks[chainId as keyof typeof networks];
  }

  // 잔액 포맷팅
  private formatBalance(balance: string): string {
    const wei = parseInt(balance, 16);
    const eth = wei / Math.pow(10, 18);
    return eth.toFixed(4);
  }

  // 체인 변경 감지
  private setupChainChangeListener(): void {
    (window as any).ethereum.on('chainChanged', (chainId: string) => {
      this.walletState.chainId = chainId;
      // 페이지 새로고침 권장
      window.location.reload();
    });
  }

  // 계정 변경 감지
  private setupAccountChangeListener(): void {
    (window as any).ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        this.walletState = {
          isConnected: false,
          address: null,
          chainId: null,
          balance: null
        };
      } else {
        this.walletState.address = accounts[0];
      }
    });
  }

  // 지갑 상태 가져오기
  public getWalletState(): WalletState {
    return { ...this.walletState };
  }

  // 연결 해제
  public disconnect(): void {
    this.walletState = {
      isConnected: false,
      address: null,
      chainId: null,
      balance: null
    };
  }
}

// 싱글톤 인스턴스 내보내기
export const walletManager = WalletManager.getInstance();

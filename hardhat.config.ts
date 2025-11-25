const { HardhatUserConfig } = require("hardhat/config");
require("@nomicfoundation/hardhat-toolbox");
const dotenv = require("dotenv");
const fsModule = require("fs");
const pathModule = require("path");

// .env.local 로드 (없으면 경고)
const envLocalPath = pathModule.resolve(__dirname, '.env.local');

if (fsModule.existsSync(envLocalPath)) {
  console.log('✅ Loading .env.local');
  dotenv.config({ path: envLocalPath });
} else {
  console.warn('⚠️ .env.local file not found');
}

// 환경별 설정
const environment = process.env.ENVIRONMENT || "localnet";

// 로컬넷 설정
const localnetRpcUrl = process.env.LOCALNET_RPC_URL || "http://127.0.0.1:8545";
const localnetPrivateKey = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// 테스트넷 설정
const testnetRpcUrl = process.env.TESTNET_RPC_URL || process.env.SEPOLIA_RPC_URL || "";
const testnetPrivateKey = process.env.PRIVATE_KEY || "";

// 메인넷 설정
const mainnetRpcUrl = process.env.MAINNET_RPC_URL || "";
const mainnetPrivateKey = process.env.PRIVATE_KEY || "";

// Etherscan API 키
const etherscanApiKey = process.env.ETHERSCAN_API_KEY || "";

const config = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    // 로컬넷 (개발/테스트용)
    hardhat: {
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        count: 20,
        accountsBalance: "10000000000000000000000" // 10000 ETH
      }
    },
    localhost: {
      url: localnetRpcUrl,
      chainId: 31337,
      accounts: localnetPrivateKey ? [localnetPrivateKey] : undefined
    },
    localnet: {
      url: localnetRpcUrl,
      chainId: 31337,
      accounts: localnetPrivateKey ? [localnetPrivateKey] : undefined
    },
    
    // 테스트넷 (검증/테스트용)
    sepolia: {
      url: testnetRpcUrl,
      chainId: 11155111,
      accounts: testnetPrivateKey ? [testnetPrivateKey] : undefined,
      gasPrice: "auto"
    },
    testnet: {
      url: testnetRpcUrl,
      chainId: 11155111,
      accounts: testnetPrivateKey ? [testnetPrivateKey] : undefined,
      gasPrice: "auto"
    },
    
    // 메인넷 (실제 운영용)
    mainnet: {
      url: mainnetRpcUrl,
      chainId: 1,
      accounts: mainnetPrivateKey ? [mainnetPrivateKey] : undefined,
      gasPrice: "auto"
    },
    ethereum: {
      url: mainnetRpcUrl,
      chainId: 1,
      accounts: mainnetPrivateKey ? [mainnetPrivateKey] : undefined,
      gasPrice: "auto"
    }
  },
  etherscan: {
    apiKey: {
      sepolia: etherscanApiKey,
      mainnet: etherscanApiKey
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD"
  }
};

module.exports = config;



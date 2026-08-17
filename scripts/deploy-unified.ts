const pkg = require("hardhat");
const { ethers } = pkg;
const fs = require("fs");
const path = require("path");

// 네트워크별 설정
const NETWORK_CONFIGS = {
  localhost: {
    name: "로컬넷",
    baseUri: "https://api.sauplatform.com/metadata/{id}.json",
    explorer: null
  },
  sepolia: {
    name: "Sepolia 테스트넷",
    baseUri: "https://api.sauplatform.com/metadata/{id}.json",
    explorer: "https://sepolia.etherscan.io"
  },
  mainnet: {
    name: "이더리움 메인넷",
    baseUri: "https://api.sauplatform.com/metadata/{id}.json",
    explorer: "https://etherscan.io"
  }
};

// hardhat.config.ts의 network alias들을 실제 배포 대상(로컬/테스트넷/메인넷)으로 정규화한다.
// RPC가 실제로 어떤 체인에 연결되어 있는지는 아래에서 network.chainId로 별도 검증한다.
const NETWORK_MODES: Record<string, "localnet" | "testnet" | "mainnet"> = {
  hardhat: "localnet",
  localhost: "localnet",
  localnet: "localnet",
  sepolia: "testnet",
  testnet: "testnet",
  mainnet: "mainnet",
  ethereum: "mainnet"
};

// hardhat.config.ts의 networks[name].chainId를 그대로 신뢰의 원천으로 사용한다.
// 값을 이 파일에 다시 하드코딩하면 두 곳이 어긋날 수 있다.
function getConfiguredChainId(networkName: string): bigint | undefined {
  const netConfig = (pkg.config.networks as Record<string, any>)[networkName];
  const chainId = netConfig?.chainId;
  return typeof chainId === "number" ? BigInt(chainId) : undefined;
}

async function main() {
  // 네트워크 정보 가져오기
  const network = await ethers.provider.getNetwork();
  const networkName = network.name || "localhost";
  const networkMode = NETWORK_MODES[networkName];

  // 알 수 없는 네트워크이거나, RPC가 실제로는 다른 체인에 연결된 경우 즉시 중단한다.
  // (예: TESTNET_RPC_URL이 실수로 다른 체인을 가리키는 경우)
  if (!networkMode) {
    throw new Error(`❌ 알 수 없는 네트워크입니다: ${networkName}. hardhat.config.ts의 networks에 정의되어 있는지 확인하세요.`);
  }

  const CONFIG_BY_MODE = {
    localnet: NETWORK_CONFIGS.localhost,
    testnet: NETWORK_CONFIGS.sepolia,
    mainnet: NETWORK_CONFIGS.mainnet
  } as const;
  const config = CONFIG_BY_MODE[networkMode];

  console.log("🚀 SAU 컨트랙트 배포 시작...");
  console.log(`📍 네트워크: ${config.name} (Chain ID: ${network.chainId})`);

  const expectedChainId = getConfiguredChainId(networkName);
  if (expectedChainId === undefined) {
    throw new Error(`❌ hardhat.config.ts의 networks.${networkName}에 chainId가 정의되어 있지 않습니다.`);
  }
  if (network.chainId !== expectedChainId) {
    throw new Error(
      `❌ RPC가 예상과 다른 체인에 연결되어 있습니다. 네트워크: ${networkName}, 예상 Chain ID: ${expectedChainId}, 실제 Chain ID: ${network.chainId}`
    );
  }

  // 배포자 정보
  const [deployer] = await ethers.getSigners();
  console.log(`👤 배포자 주소: ${deployer.address}`);

  // 배포자 잔액 확인
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceEth = ethers.formatEther(balance);
  console.log(`💰 배포자 잔액: ${balanceEth} ETH`);

  // 잔액 부족 확인: 메인넷은 배포를 중단, 테스트넷은 경고만, 로컬넷은 스킵
  if (networkMode === "mainnet") {
    if (balance < ethers.parseEther("0.1")) {
      throw new Error("❌ 배포자 잔액이 부족합니다. 메인넷 배포에는 최소 0.1 ETH가 필요합니다.");
    }
  } else if (networkMode === "testnet" && balance < ethers.parseEther("0.01")) {
    console.warn("⚠️  배포자 잔액이 부족할 수 있습니다. Sepolia Faucet에서 테스트 ETH를 받으세요: https://sepoliafaucet.com/");
  }

  // 컨트랙트 배포
  console.log("📦 SAU 컨트랙트 배포 중...");
  const Sau1155 = await ethers.getContractFactory("Sau1155");
  const sau1155 = await Sau1155.deploy(config.baseUri, deployer.address);
  
  console.log("⏳ 배포 트랜잭션 확인 중...");
  await sau1155.waitForDeployment();
  const contractAddress = await sau1155.getAddress();
  
  console.log("✅ 배포 완료!");
  console.log(`📍 컨트랙트 주소: ${contractAddress}`);
  
  // 트랜잭션 해시 및 배포 블록 번호 가져오기 ([4-8]의 SAU_DEPLOYMENT_BLOCK 자동 기록용)
  const deploymentTx = sau1155.deploymentTransaction();
  let deploymentBlock: number | null = null;
  if (deploymentTx) {
    console.log(`🔗 트랜잭션 해시: ${deploymentTx.hash}`);
    if (config.explorer) {
      console.log(`🔍 블록 익스플로러: ${config.explorer}/tx/${deploymentTx.hash}`);
    }
    const receipt = await ethers.provider.getTransactionReceipt(deploymentTx.hash);
    deploymentBlock = receipt?.blockNumber ?? null;
    if (deploymentBlock !== null) {
      console.log(`📦 배포 블록 번호: ${deploymentBlock}`);
    } else {
      console.warn("⚠️  배포 블록 번호를 확인하지 못했습니다. SAU_DEPLOYMENT_BLOCK을 수동으로 설정해주세요.");
    }
  }

  // 환경 변수 파일 업데이트
  await updateEnvFile(contractAddress, networkMode, expectedChainId, deploymentBlock);

  // 컨트랙트 정보 출력
  await printContractInfo(sau1155, contractAddress, config.name, network.chainId, deployer.address);

  // 다음 단계 안내
  printNextSteps(networkMode);
}

async function updateEnvFile(
  contractAddress: string,
  networkMode: "localnet" | "testnet" | "mainnet",
  chainId: bigint,
  deploymentBlock: number | null
) {
  const envPath = path.join(process.cwd(), ".env.local");
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  let updatedContent = envContent;

  // 컨트랙트 주소 업데이트
  if (envContent.includes("SAU_CONTRACT_ADDRESS=")) {
    updatedContent = envContent.replace(
      /SAU_CONTRACT_ADDRESS=.*/,
      `SAU_CONTRACT_ADDRESS="${contractAddress}"`
    );
  } else {
    updatedContent += `\nSAU_CONTRACT_ADDRESS="${contractAddress}"\n`;
  }

  if (updatedContent.includes("NEXT_PUBLIC_SAU_CONTRACT_ADDRESS=")) {
    updatedContent = updatedContent.replace(
      /NEXT_PUBLIC_SAU_CONTRACT_ADDRESS=.*/,
      `NEXT_PUBLIC_SAU_CONTRACT_ADDRESS="${contractAddress}"`
    );
  } else {
    updatedContent += `NEXT_PUBLIC_SAU_CONTRACT_ADDRESS="${contractAddress}"\n`;
  }

  // 배포 블록 번호 업데이트 ([4-8] — /api/unified의 이벤트 스캔 시작점으로 사용됨,
  // 필수 환경변수라 이 값이 없으면 NFT 목록 조회가 실패한다)
  if (deploymentBlock !== null) {
    if (updatedContent.includes("SAU_DEPLOYMENT_BLOCK=")) {
      updatedContent = updatedContent.replace(
        /SAU_DEPLOYMENT_BLOCK=.*/,
        `SAU_DEPLOYMENT_BLOCK=${deploymentBlock}`
      );
    } else {
      updatedContent += `SAU_DEPLOYMENT_BLOCK=${deploymentBlock}\n`;
    }
  }

  // 네트워크 모드 업데이트
  if (envContent.includes("NETWORK_MODE=")) {
    updatedContent = updatedContent.replace(
      /NETWORK_MODE=.*/,
      `NETWORK_MODE=${networkMode}`
    );
  } else {
    updatedContent += `NETWORK_MODE=${networkMode}\n`;
  }

  if (envContent.includes("NEXT_PUBLIC_CHAIN_ID=")) {
    updatedContent = updatedContent.replace(
      /NEXT_PUBLIC_CHAIN_ID=.*/,
      `NEXT_PUBLIC_CHAIN_ID=${chainId}`
    );
  } else {
    updatedContent += `NEXT_PUBLIC_CHAIN_ID=${chainId}\n`;
  }
  
  fs.writeFileSync(envPath, updatedContent);
  console.log(`📝 .env.local 파일 업데이트 완료`);
}

async function printContractInfo(
  contract: any, 
  address: string, 
  networkName: string, 
  chainId: bigint, 
  deployer: string
) {
  console.log("\n📋 컨트랙트 정보:");
  console.log(`- 이름: SAU Content Access Token`);
  console.log(`- 심볼: SAU`);
  console.log(`- 주소: ${address}`);
  console.log(`- 네트워크: ${networkName} (Chain ID: ${chainId})`);
  console.log(`- 배포자: ${deployer}`);
  
  try {
    const name = await contract.name();
    const symbol = await contract.symbol();
    const hasAdminRole = await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), deployer);

    console.log(`- 컨트랙트 이름: ${name}`);
    console.log(`- 컨트랙트 심볼: ${symbol}`);
    console.log(`- 배포자 DEFAULT_ADMIN_ROLE 보유 여부: ${hasAdminRole}`);
  } catch (error) {
    console.warn("⚠️  컨트랙트 정보 조회 실패:", error);
  }
}

function printNextSteps(networkMode: "localnet" | "testnet" | "mainnet") {
  console.log("\n🎯 다음 단계:");

  if (networkMode === "localnet") {
    console.log("1. 개발 서버 실행: npm run dev 또는 pnpm dev");
    console.log("2. 브라우저에서 http://localhost:3000 접속");
    console.log("3. NFT 생성 및 테스트");
    console.log("4. MetaMask에서 로컬 네트워크 추가 (Chain ID: 31337)");
  } else if (networkMode === "testnet") {
    console.log("1. Sepolia 테스트넷 ETH가 충분한지 확인");
    console.log("2. MetaMask에서 Sepolia 네트워크 연결");
    console.log("3. 개발 서버 실행: npm run dev");
    console.log("4. NFT 생성 및 테스트");
  } else {
    console.log("1. 메인넷 ETH가 충분한지 확인");
    console.log("2. MetaMask에서 이더리움 메인넷 연결");
    console.log("3. 프로덕션 빌드: npm run build");
    console.log("4. 프로덕션 서버 실행");
  }
  
  console.log("\n💡 유용한 명령어:");
  console.log("- 컨트랙트 검증: npx hardhat verify --network <network> <contract-address>");
  console.log("- 테스트 실행: npx hardhat test");
  console.log("- 가스 리포트: npx hardhat test --gas-report");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 배포 실패:", error);
    process.exit(1);
  });

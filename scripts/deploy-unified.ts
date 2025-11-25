const pkg = require("hardhat");
const { ethers } = pkg;
const fs = require("fs");
const path = require("path");

// 네트워크별 설정
const NETWORK_CONFIGS = {
  localhost: {
    name: "로컬넷",
    baseUri: "https://api.sauplatform.com/metadata/",
    explorer: null
  },
  sepolia: {
    name: "Sepolia 테스트넷",
    baseUri: "https://api.sauplatform.com/metadata/",
    explorer: "https://sepolia.etherscan.io"
  },
  mainnet: {
    name: "이더리움 메인넷",
    baseUri: "https://api.sauplatform.com/metadata/",
    explorer: "https://etherscan.io"
  }
};

async function main() {
  // 네트워크 정보 가져오기
  const network = await ethers.provider.getNetwork();
  const networkName = network.name || "localhost";
  const config = NETWORK_CONFIGS[networkName as keyof typeof NETWORK_CONFIGS] || NETWORK_CONFIGS.localhost;
  
  console.log("🚀 SAU 컨트랙트 배포 시작...");
  console.log(`📍 네트워크: ${config.name} (Chain ID: ${network.chainId})`);
  
  // 배포자 정보
  const [deployer] = await ethers.getSigners();
  console.log(`👤 배포자 주소: ${deployer.address}`);
  
  // 배포자 잔액 확인
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceEth = ethers.formatEther(balance);
  console.log(`💰 배포자 잔액: ${balanceEth} ETH`);
  
  // 잔액 부족 확인 (메인넷/테스트넷의 경우)
  if (networkName !== "localhost" && parseFloat(balanceEth) < 0.01) {
    console.warn("⚠️  잔액이 부족할 수 있습니다. 배포를 계속하시겠습니까?");
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
  
  // 트랜잭션 해시 가져오기
  const deploymentTx = sau1155.deploymentTransaction();
  if (deploymentTx) {
    console.log(`🔗 트랜잭션 해시: ${deploymentTx.hash}`);
    if (config.explorer) {
      console.log(`🔍 블록 익스플로러: ${config.explorer}/tx/${deploymentTx.hash}`);
    }
  }
  
  // 환경 변수 파일 업데이트
  await updateEnvFile(contractAddress, networkName);
  
  // 컨트랙트 정보 출력
  await printContractInfo(sau1155, contractAddress, config.name, network.chainId, deployer.address);
  
  // 다음 단계 안내
  printNextSteps(networkName);
}

async function updateEnvFile(contractAddress: string, networkName: string) {
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
  
  // 네트워크 모드 업데이트
  const networkMode = networkName === "localhost" ? "localnet" : 
                     networkName === "sepolia" ? "testnet" : "mainnet";
  
  if (envContent.includes("NETWORK_MODE=")) {
    updatedContent = updatedContent.replace(
      /NETWORK_MODE=.*/,
      `NETWORK_MODE=${networkMode}`
    );
  } else {
    updatedContent += `NETWORK_MODE=${networkMode}\n`;
  }
  
  // Chain ID 업데이트
  const chainId = networkName === "localhost" ? "31337" :
                  networkName === "sepolia" ? "11155111" : "1";
  
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
    const owner = await contract.owner();
    
    console.log(`- 컨트랙트 이름: ${name}`);
    console.log(`- 컨트랙트 심볼: ${symbol}`);
    console.log(`- 컨트랙트 소유자: ${owner}`);
  } catch (error) {
    console.warn("⚠️  컨트랙트 정보 조회 실패:", error);
  }
}

function printNextSteps(networkName: string) {
  console.log("\n🎯 다음 단계:");
  
  if (networkName === "localhost") {
    console.log("1. 개발 서버 실행: npm run dev 또는 pnpm dev");
    console.log("2. 브라우저에서 http://localhost:3000 접속");
    console.log("3. NFT 생성 및 테스트");
    console.log("4. MetaMask에서 로컬 네트워크 추가 (Chain ID: 31337)");
  } else if (networkName === "sepolia") {
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

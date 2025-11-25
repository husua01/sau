const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Sepolia 테스트넷에 SAU 컨트랙트 배포 시작...");
  
  // 네트워크 정보 출력
  const network = await ethers.provider.getNetwork();
  console.log(`📍 네트워크: ${network.name} (Chain ID: ${network.chainId})`);
  
  if (network.chainId !== 11155111n) {
    throw new Error("❌ Sepolia 테스트넷이 아닙니다. Chain ID: 11155111이어야 합니다.");
  }
  
  // 배포자 정보
  const [deployer] = await ethers.getSigners();
  console.log(`👤 배포자 주소: ${deployer.address}`);
  
  // 배포자 잔액 확인
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 배포자 잔액: ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther("0.01")) {
    console.log("⚠️  경고: 배포자 잔액이 부족합니다. 최소 0.01 ETH가 필요합니다.");
    console.log("💡 Sepolia Faucet에서 테스트 ETH를 받으세요: https://sepoliafaucet.com/");
  }
  
  // 가스 가격 확인
  const gasPrice = await ethers.provider.getFeeData();
  console.log(`⛽ 가스 가격: ${ethers.formatUnits(gasPrice.gasPrice || 0, "gwei")} gwei`);
  
  // 컨트랙트 배포
  console.log("📦 SAU 컨트랙트 배포 중...");
  const Sau1155 = await ethers.getContractFactory("Sau1155");
  const baseUri = "https://api.sauplatform.com/metadata/";
  const sau1155 = await Sau1155.deploy(baseUri, deployer.address);
  
  console.log("⏳ 트랜잭션 확인 대기 중...");
  await sau1155.waitForDeployment();
  const contractAddress = await sau1155.getAddress();
  
  console.log("✅ 배포 완료!");
  console.log(`📍 컨트랙트 주소: ${contractAddress}`);
  
  // Etherscan 링크 출력
  console.log(`🔍 Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);
  
  // 환경 변수 파일 업데이트
  const envPath = path.join(process.cwd(), ".env.local");
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  
  let updatedContent = envContent;
  if (envContent.includes("SAU_CONTRACT_ADDRESS=")) {
    updatedContent = envContent.replace(
      /SAU_CONTRACT_ADDRESS=.*/,
      `SAU_CONTRACT_ADDRESS="${contractAddress}"`
    );
  } else {
    updatedContent += `\nSAU_CONTRACT_ADDRESS="${contractAddress}"\n`;
  }
  
  fs.writeFileSync(envPath, updatedContent);
  console.log(`📝 .env.local 파일 업데이트 완료`);
  
  // 컨트랙트 정보 출력
  console.log("\n📋 컨트랙트 정보:");
  console.log(`- 이름: SAU`);
  console.log(`- 주소: ${contractAddress}`);
  console.log(`- 네트워크: Sepolia 테스트넷`);
  console.log(`- 배포자: ${deployer.address}`);
  
  console.log("\n🎯 다음 단계:");
  console.log("1. Etherscan에서 컨트랙트 확인");
  console.log("2. 개발 서버 실행: pnpm dev");
  console.log("3. MetaMask에서 Sepolia 네트워크 추가");
  console.log("4. NFT 생성 및 테스트");
  
  console.log("\n⚠️  주의사항:");
  console.log("- Sepolia는 테스트넷이므로 실제 가치가 없습니다");
  console.log("- 테스트 ETH는 Faucet에서 받을 수 있습니다");
  console.log("- 모든 트랜잭션은 공개적으로 확인 가능합니다");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 배포 실패:", error);
    process.exit(1);
  });

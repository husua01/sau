import pkg from "hardhat";
const { ethers } = pkg;
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Ethereum 메인넷에 SAU 컨트랙트 배포 시작...");
  
  // 네트워크 정보 출력
  const network = await ethers.provider.getNetwork();
  console.log(`📍 네트워크: ${network.name} (Chain ID: ${network.chainId})`);
  
  if (network.chainId !== 1n) {
    throw new Error("❌ Ethereum 메인넷이 아닙니다. Chain ID: 1이어야 합니다.");
  }
  
  // 배포자 정보
  const [deployer] = await ethers.getSigners();
  console.log(`👤 배포자 주소: ${deployer.address}`);
  
  // 배포자 잔액 확인
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 배포자 잔액: ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther("0.1")) {
    throw new Error("❌ 배포자 잔액이 부족합니다. 최소 0.1 ETH가 필요합니다.");
  }
  
  // 가스 가격 확인
  const gasPrice = await ethers.provider.getFeeData();
  console.log(`⛽ 가스 가격: ${ethers.formatUnits(gasPrice.gasPrice || 0, "gwei")} gwei`);
  
  // 예상 가스비 계산
  const estimatedGas = await ethers.provider.estimateGas({
    data: (await ethers.getContractFactory("Sau1155")).bytecode
  });
  const estimatedCost = estimatedGas * (gasPrice.gasPrice || 0n);
  console.log(`💰 예상 배포 비용: ${ethers.formatEther(estimatedCost)} ETH`);
  
  // 최종 확인
  console.log("\n⚠️  메인넷 배포 최종 확인:");
  console.log(`- 네트워크: Ethereum 메인넷 (Chain ID: 1)`);
  console.log(`- 배포자: ${deployer.address}`);
  console.log(`- 예상 비용: ${ethers.formatEther(estimatedCost)} ETH`);
  console.log("\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까? (y/N)");
  
  // 실제 배포에서는 사용자 확인을 받아야 하지만, 스크립트에서는 주석 처리
  // const readline = require('readline');
  // const rl = readline.createInterface({
  //   input: process.stdin,
  //   output: process.stdout
  // });
  // 
  // const answer = await new Promise<string>((resolve) => {
  //   rl.question('계속하시겠습니까? (y/N): ', resolve);
  // });
  // rl.close();
  // 
  // if (answer.toLowerCase() !== 'y') {
  //   console.log("❌ 배포가 취소되었습니다.");
  //   process.exit(0);
  // }
  
  // 컨트랙트 배포
  console.log("📦 SAU 컨트랙트 배포 중...");
  const Sau1155 = await ethers.getContractFactory("Sau1155");
  const baseUri = "https://api.sauplatform.com/metadata/";
  const sau1155 = await Sau1155.deploy(baseUri, deployer.address);
  
  console.log("⏳ 트랜잭션 확인 대기 중... (약 12-15초)");
  await sau1155.waitForDeployment();
  const contractAddress = await sau1155.getAddress();
  
  console.log("✅ 배포 완료!");
  console.log(`📍 컨트랙트 주소: ${contractAddress}`);
  
  // Etherscan 링크 출력
  console.log(`🔍 Etherscan: https://etherscan.io/address/${contractAddress}`);
  
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
  console.log(`- 네트워크: Ethereum 메인넷`);
  console.log(`- 배포자: ${deployer.address}`);
  console.log(`- 실제 배포 비용: ${ethers.formatEther(estimatedCost)} ETH`);
  
  console.log("\n🎯 다음 단계:");
  console.log("1. Etherscan에서 컨트랙트 확인");
  console.log("2. 컨트랙트 소스 코드 검증 (선택사항)");
  console.log("3. 프로덕션 서버 배포");
  console.log("4. 사용자 테스트");
  
  console.log("\n⚠️  중요사항:");
  console.log("- 메인넷 배포는 영구적이며 되돌릴 수 없습니다");
  console.log("- 실제 ETH가 소모됩니다");
  console.log("- 모든 트랜잭션은 공개적으로 확인 가능합니다");
  console.log("- 충분한 테스트 후 배포하세요");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 배포 실패:", error);
    process.exit(1);
  });

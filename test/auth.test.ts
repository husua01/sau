import { expect } from "chai";
import { ethers as hardhatEthers } from "hardhat";
import { verifySiwe, buildSiweMessage } from "../src/lib/auth";

// /api/unified의 보호된 다섯 핸들러(handleTestAccess, handleGetUserNFTs,
// handleCheckNFTOwnership, handleGetNFTMetadata, handleUploadSharedContent)는
// 모두 다음과 동일한 패턴으로 verifySiwe(...)를 호출하고, ok가 false면 그대로
// 401을 반환한다:
//
//   const auth = verifySiwe(siweMessage, siweSignature, targetAddress);
//   if (!auth.ok) {
//     return NextResponse.json({ success: false, error: 'Unauthorized', message: auth.reason }, { status: 401 });
//   }
//
// 즉 각 핸들러가 401을 반환하는지 여부는 verifySiwe(...).ok의 값과 1:1로 대응된다.
// 실제 Next.js 서버를 띄우지 않고, 라우트가 분기하는 이 판정 함수를 직접 검증한다.

async function getSigner() {
  const [signer] = await hardhatEthers.getSigners();
  return signer;
}

describe("auth.verifySiwe (SIWE 검증 — 401 판정 로직)", function () {
  it("서명 없는 요청은 실패(401 대상)로 판정된다", async function () {
    const signer = await getSigner();
    const message = buildSiweMessage(signer.address, "example.com", "SAU: test_access");

    const result = verifySiwe(message, "", signer.address);
    expect(result.ok).to.equal(false);
  });

  it("메시지 없는 요청은 실패(401 대상)로 판정된다", async function () {
    const signer = await getSigner();
    const result = verifySiwe("", "0xdeadbeef", signer.address);
    expect(result.ok).to.equal(false);
  });

  it("정상 서명 + 본인 주소는 성공으로 판정된다", async function () {
    const signer = await getSigner();
    const message = buildSiweMessage(signer.address, "example.com", "SAU: test_access");
    const signature = await signer.signMessage(message);

    const result = verifySiwe(message, signature, signer.address);
    expect(result.ok).to.equal(true);
  });

  it("[가장 중요] 타인 주소를 지정한 요청은 실패(401 대상)로 판정된다", async function () {
    const [signerA, signerB] = await hardhatEthers.getSigners();

    // signerA가 서명한 메시지를, signerB의 주소인 것처럼 검증 요청
    const message = buildSiweMessage(signerA.address, "example.com", "SAU: test_access");
    const signature = await signerA.signMessage(message);

    const result = verifySiwe(message, signature, signerB.address);
    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.reason).to.equal("Signature does not match address");
    }
  });

  it("이더스캔 등에서 복사한 '실제 보유자 주소'를 그대로 넣어도 서명이 없으면 통과하지 못한다", async function () {
    const attacker = await getSigner();
    const realHolderAddress = "0x000000000000000000000000000000000000Ab";

    // 공격자가 realHolderAddress를 흉내내려 해도, 서명은 attacker의 개인키로만
    // 만들 수 있으므로 recovered address가 realHolderAddress와 일치할 수 없다.
    const message = buildSiweMessage(realHolderAddress, "example.com", "SAU: test_access");
    const signature = await attacker.signMessage(message);

    const result = verifySiwe(message, signature, realHolderAddress);
    expect(result.ok).to.equal(false);
  });

  it("만료된 메시지(5분 초과)는 실패(401 대상)로 판정된다", async function () {
    const signer = await getSigner();

    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const expiredMessage = [
      `example.com wants you to sign in with your Ethereum account:`,
      signer.address,
      "",
      "SAU: test_access",
      "",
      "URI: https://example.com",
      "Version: 1",
      "Nonce: expiredtestnonce123",
      `Issued At: ${sixMinutesAgo}`,
    ].join("\n");
    const signature = await signer.signMessage(expiredMessage);

    const result = verifySiwe(expiredMessage, signature, signer.address);
    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.reason).to.equal("Expired message");
    }
  });

  it("nonce 재사용 요청은 실패(401 대상)로 판정된다", async function () {
    const signer = await getSigner();
    const message = buildSiweMessage(signer.address, "example.com", "SAU: test_access");
    const signature = await signer.signMessage(message);

    const first = verifySiwe(message, signature, signer.address);
    expect(first.ok).to.equal(true);

    // 동일한 메시지+서명(=동일 nonce)으로 재요청
    const second = verifySiwe(message, signature, signer.address);
    expect(second.ok).to.equal(false);
    if (!second.ok) {
      expect(second.reason).to.equal("Nonce already used");
    }
  });

  it("Nonce/Issued At 필드가 없는 형식이 어긋난 메시지는 실패로 판정된다", async function () {
    const signer = await getSigner();
    const malformed = "not a real siwe message";
    const signature = await signer.signMessage(malformed);

    const result = verifySiwe(malformed, signature, signer.address);
    expect(result.ok).to.equal(false);
  });
});

describe("auth.buildSiweMessage", function () {
  it("호출할 때마다 서로 다른 nonce를 생성한다", function () {
    const a = buildSiweMessage("0x0000000000000000000000000000000000dEaD", "example.com", "SAU: test");
    const b = buildSiweMessage("0x0000000000000000000000000000000000dEaD", "example.com", "SAU: test");

    const nonceA = a.match(/Nonce: (\S+)/)?.[1];
    const nonceB = b.match(/Nonce: (\S+)/)?.[1];

    expect(nonceA).to.be.a("string").and.not.empty;
    expect(nonceA).to.not.equal(nonceB);
  });
});

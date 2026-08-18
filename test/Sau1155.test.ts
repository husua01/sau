import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const BASE_URI = "https://api.sauplatform.com/metadata/{id}.json";
const CONTENT_HASH = "QmTestContentHash";
const TOKEN_URI = "https://gateway.pinata.cloud/ipfs/QmTestTokenMetadata";

// mintOwn이 요구하는 tokenId 형태: 상위 160비트 = 호출자 주소, 하위 96비트 = 무작위.
// 프론트엔드 generateTokenId()와 같은 규칙이다.
function ownTokenId(address: string, suffix: bigint) {
  return (BigInt(address) << 96n) | suffix;
}

async function deployFixture() {
  const [admin, minter, creator, holder, other] = await ethers.getSigners();

  const Sau1155 = await ethers.getContractFactory("Sau1155");
  const sau1155 = await Sau1155.deploy(BASE_URI, admin.address);
  await sau1155.waitForDeployment();

  const MINTER_ROLE = await sau1155.MINTER_ROLE();
  const DEFAULT_ADMIN_ROLE = await sau1155.DEFAULT_ADMIN_ROLE();

  // admin (배포자)은 생성자에서 이미 MINTER_ROLE을 보유한다.
  await sau1155.connect(admin).grantRole(MINTER_ROLE, minter.address);

  return { sau1155, admin, minter, creator, holder, other, MINTER_ROLE, DEFAULT_ADMIN_ROLE };
}

describe("Sau1155", function () {
  describe("mint / mintWithMetadata — MINTER_ROLE", function () {
    it("MINTER_ROLE이 없는 주소의 mint는 리버트된다", async function () {
      const { sau1155, other, holder } = await loadFixture(deployFixture);

      await expect(
        sau1155.connect(other).mint(holder.address, 1, 1, CONTENT_HASH)
      ).to.be.reverted;
    });

    it("MINTER_ROLE을 보유한 주소는 정상적으로 mint할 수 있다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      await expect(sau1155.connect(minter).mint(holder.address, 1, 1, CONTENT_HASH))
        .to.emit(sau1155, "ContentCreated")
        .withArgs(1, holder.address, CONTENT_HASH)
        .and.to.emit(sau1155, "AccessGranted")
        .withArgs(holder.address, 1);

      expect(await sau1155.balanceOf(holder.address, 1)).to.equal(1);
    });
  });

  describe("[3-2] tokenId 재사용 차단", function () {
    it("이미 사용된 tokenId로 다시 mint하면 리버트된다", async function () {
      const { sau1155, minter, holder, other } = await loadFixture(deployFixture);

      await sau1155.connect(minter).mint(holder.address, 1, 1, CONTENT_HASH);

      await expect(
        sau1155.connect(minter).mint(other.address, 1, 1, "different-hash")
      ).to.be.revertedWith("Token ID already used");

      // 원래 메타데이터가 덮어써지지 않았는지 확인
      const [contentHash, creator] = await sau1155.getTokenInfo(1);
      expect(contentHash).to.equal(CONTENT_HASH);
      expect(creator).to.equal(holder.address);
    });

    it("mintWithMetadata도 동일 tokenId 재사용을 막는다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      await sau1155
        .connect(minter)
        .mintWithMetadata(holder.address, 5, 1, CONTENT_HASH, TOKEN_URI);

      await expect(
        sau1155
          .connect(minter)
          .mintWithMetadata(holder.address, 5, 1, CONTENT_HASH, TOKEN_URI)
      ).to.be.revertedWith("Token ID already used");
    });
  });

  describe("[3-6] mintOwn — 자기 자신에게만 민팅", function () {
    it("mintOwn은 msg.sender에게만 발행한다", async function () {
      const { sau1155, holder, other } = await loadFixture(deployFixture);
      const id = ownTokenId(holder.address, 42n);

      await sau1155.connect(holder).mintOwn(id, 1, CONTENT_HASH, TOKEN_URI);

      expect(await sau1155.balanceOf(holder.address, id)).to.equal(1);
      expect(await sau1155.balanceOf(other.address, id)).to.equal(0);

      const [, creator] = await sau1155.getTokenInfo(id);
      expect(creator).to.equal(holder.address);
    });

    it("MINTER_ROLE이 없어도 mintOwn을 호출할 수 있다", async function () {
      const { sau1155, other } = await loadFixture(deployFixture);

      await expect(
        sau1155
          .connect(other)
          .mintOwn(ownTokenId(other.address, 99n), 1, CONTENT_HASH, TOKEN_URI)
      ).to.not.be.reverted;
    });

    it("mintOwn도 동일 tokenId 재사용을 막는다", async function () {
      const { sau1155, holder } = await loadFixture(deployFixture);
      const id = ownTokenId(holder.address, 7n);

      await sau1155.connect(holder).mintOwn(id, 1, CONTENT_HASH, TOKEN_URI);

      await expect(
        sau1155.connect(holder).mintOwn(id, 1, "other-hash", TOKEN_URI)
      ).to.be.revertedWith("Token ID already used");
    });

    it("amount가 1이 아니면 리버트된다 (누구나 호출 가능하므로 무상 대량 발행 방지)", async function () {
      const { sau1155, holder } = await loadFixture(deployFixture);

      await expect(
        sau1155
          .connect(holder)
          .mintOwn(ownTokenId(holder.address, 55n), 5, CONTENT_HASH, TOKEN_URI)
      ).to.be.revertedWith("mintOwn: amount must be 1");

      await expect(
        sau1155
          .connect(holder)
          .mintOwn(ownTokenId(holder.address, 56n), 0, CONTENT_HASH, TOKEN_URI)
      ).to.be.revertedWith("mintOwn: amount must be 1");
    });
  });

  // 이 앱은 민팅 '전에' 콘텐츠를 tokenId로 암호화해 Arweave에 올리므로, mintOwn이
  // 멤풀에 뜨는 순간 tokenId와 암호문 위치가 함께 공개된다. 아무 제약이 없으면 공격자가
  // 같은 id로 앞질러 민팅해 소유자가 되고, Lit 접근 조건(balanceOf > 0)을 그대로
  // 통과해 피해자의 콘텐츠를 복호화할 수 있다.
  describe("[신규] mintOwn tokenId 선점(front-running) 차단", function () {
    it("[가장 중요] 공격자는 피해자 주소로 시작하는 tokenId를 선점할 수 없다", async function () {
      const { sau1155, holder: victim, other: attacker } =
        await loadFixture(deployFixture);

      // 피해자가 쓰려던, 멤풀에서 그대로 관찰 가능한 tokenId
      const victimTokenId = ownTokenId(victim.address, 123456789n);

      await expect(
        sau1155
          .connect(attacker)
          .mintOwn(victimTokenId, 1, "stolen", TOKEN_URI)
      ).to.be.revertedWith("mintOwn: id must be prefixed with caller");

      // 피해자는 정상적으로 민팅할 수 있고, 소유자는 피해자다
      await sau1155
        .connect(victim)
        .mintOwn(victimTokenId, 1, CONTENT_HASH, TOKEN_URI);
      expect(await sau1155.balanceOf(victim.address, victimTokenId)).to.equal(1);
      expect(await sau1155.balanceOf(attacker.address, victimTokenId)).to.equal(0);
    });

    it("접두사가 없는 임의의 작은 tokenId도 거부된다", async function () {
      const { sau1155, holder } = await loadFixture(deployFixture);

      await expect(
        sau1155.connect(holder).mintOwn(42, 1, CONTENT_HASH, TOKEN_URI)
      ).to.be.revertedWith("mintOwn: id must be prefixed with caller");
    });

    it("tokenIdPrefixOf는 프론트엔드의 tokenId 생성 규칙과 일치한다", async function () {
      const { sau1155, holder } = await loadFixture(deployFixture);

      // src/app/create/page.tsx의 generateTokenId()와 같은 계산
      expect(await sau1155.tokenIdPrefixOf(holder.address)).to.equal(
        BigInt(holder.address)
      );
      expect(ownTokenId(holder.address, 1n) >> 96n).to.equal(
        BigInt(holder.address)
      );
    });
  });

  // balanceOf > 0만 보면 NFT를 몇 분 빌려 복호화하고 반납하는 경로가 그대로 열린다.
  // Lit의 evmContractConditions가 이 함수를 호출해 최소 보유 기간을 확인한다.
  describe("[신규] hasHeldFor — 대여 우회 방어", function () {
    const ONE_HOUR = 3600;

    it("[가장 중요] 방금 넘겨받은 주소는 최소 보유 기간을 못 채워 거부된다", async function () {
      const { sau1155, holder, other } = await loadFixture(deployFixture);
      const id = ownTokenId(holder.address, 1n);
      await sau1155.connect(holder).mintOwn(id, 1, CONTENT_HASH, TOKEN_URI);

      // "빌려서 받는" 순간 — 잔액은 있지만 시계는 0초부터 시작
      await sau1155
        .connect(holder)
        .safeTransferFrom(holder.address, other.address, id, 1, "0x");

      expect(await sau1155.balanceOf(other.address, id)).to.equal(1);
      expect(await sau1155.hasAccess(other.address, id)).to.equal(true);
      expect(await sau1155.hasHeldFor(other.address, id, ONE_HOUR)).to.equal(
        false
      );
    });

    it("최소 보유 기간을 넘기면 통과한다", async function () {
      const { sau1155, holder, other } = await loadFixture(deployFixture);
      const id = ownTokenId(holder.address, 2n);
      await sau1155.connect(holder).mintOwn(id, 1, CONTENT_HASH, TOKEN_URI);
      await sau1155
        .connect(holder)
        .safeTransferFrom(holder.address, other.address, id, 1, "0x");

      await time.increase(ONE_HOUR + 1);

      expect(await sau1155.hasHeldFor(other.address, id, ONE_HOUR)).to.equal(
        true
      );
    });

    it("[가장 중요] 빌렸다 반납하면 기록이 지워져, 다시 빌려도 즉시 통과하지 못한다", async function () {
      const { sau1155, holder, other } = await loadFixture(deployFixture);
      const id = ownTokenId(holder.address, 3n);
      await sau1155.connect(holder).mintOwn(id, 1, CONTENT_HASH, TOKEN_URI);

      // 1회차: 빌려서 오래 보유했다가 반납
      await sau1155
        .connect(holder)
        .safeTransferFrom(holder.address, other.address, id, 1, "0x");
      await time.increase(ONE_HOUR + 1);
      await sau1155
        .connect(other)
        .safeTransferFrom(other.address, holder.address, id, 1, "0x");
      expect(await sau1155.holdingSince(id, other.address)).to.equal(0);

      // 2회차: 다시 빌리면 시계가 0부터 — 옛 기록으로 통과하면 안 된다
      await sau1155
        .connect(holder)
        .safeTransferFrom(holder.address, other.address, id, 1, "0x");
      expect(await sau1155.hasHeldFor(other.address, id, ONE_HOUR)).to.equal(
        false
      );
    });

    it("창작자는 대기 없이 통과한다 (이미 원본 평문을 갖고 있음)", async function () {
      const { sau1155, holder } = await loadFixture(deployFixture);
      const id = ownTokenId(holder.address, 4n);
      await sau1155.connect(holder).mintOwn(id, 1, CONTENT_HASH, TOKEN_URI);

      expect(await sau1155.hasHeldFor(holder.address, id, ONE_HOUR)).to.equal(
        true
      );
    });

    it("아예 보유하지 않은 주소는 기간과 무관하게 거부된다", async function () {
      const { sau1155, holder, other } = await loadFixture(deployFixture);
      const id = ownTokenId(holder.address, 5n);
      await sau1155.connect(holder).mintOwn(id, 1, CONTENT_HASH, TOKEN_URI);

      await time.increase(ONE_HOUR * 24);

      expect(await sau1155.hasHeldFor(other.address, id, ONE_HOUR)).to.equal(
        false
      );
      expect(await sau1155.hasHeldFor(other.address, id, 0)).to.equal(false);
    });

    it("이미 보유 중인 주소가 추가 수량을 받아도 시계가 되돌아가지 않는다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      await sau1155.connect(minter).mint(holder.address, 77, 1, CONTENT_HASH);
      const since = await sau1155.holdingSince(77, holder.address);

      await time.increase(ONE_HOUR + 1);
      await sau1155.connect(minter).mint(holder.address, 78, 1, CONTENT_HASH);
      // 같은 id로 추가 수량을 받는 경로 (배치 전송)
      await sau1155
        .connect(holder)
        .safeTransferFrom(holder.address, holder.address, 77, 1, "0x");

      expect(await sau1155.holdingSince(77, holder.address)).to.equal(since);
    });
  });

  describe("[3-1] setTokenURI — 창작자 전용, 1회 한정", function () {
    it("창작자가 아닌 보유자의 setTokenURI는 리버트된다", async function () {
      const { sau1155, minter, holder, other } = await loadFixture(deployFixture);

      // holder가 창작자(=to)로 mint됨
      await sau1155.connect(minter).mint(holder.address, 1, 1, CONTENT_HASH);

      // holder에게서 other로 토큰을 넘겨 other가 "보유자"가 되게 한다
      await sau1155
        .connect(holder)
        .safeTransferFrom(holder.address, other.address, 1, 1, "0x");

      await expect(
        sau1155.connect(other).setTokenURI(1, TOKEN_URI)
      ).to.be.revertedWith("Not creator");
    });

    it("창작자는 setTokenURI를 1회 호출할 수 있다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      await sau1155.connect(minter).mint(holder.address, 1, 1, CONTENT_HASH);

      await expect(sau1155.connect(holder).setTokenURI(1, TOKEN_URI))
        .to.emit(sau1155, "URI")
        .withArgs(TOKEN_URI, 1);

      expect(await sau1155.uri(1)).to.equal(TOKEN_URI);
    });

    it("이미 설정된 URI를 재설정하려 하면 리버트된다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      await sau1155.connect(minter).mint(holder.address, 1, 1, CONTENT_HASH);
      await sau1155.connect(holder).setTokenURI(1, TOKEN_URI);

      await expect(
        sau1155.connect(holder).setTokenURI(1, "https://example.com/new.json")
      ).to.be.revertedWith("URI already set");
    });

    it("mintWithMetadata로 이미 URI가 설정된 토큰도 재설정이 막힌다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      await sau1155
        .connect(minter)
        .mintWithMetadata(holder.address, 1, 1, CONTENT_HASH, TOKEN_URI);

      await expect(
        sau1155.connect(holder).setTokenURI(1, "https://example.com/new.json")
      ).to.be.revertedWith("URI already set");
    });
  });

  describe("전송에 따른 hasAccess 변화", function () {
    it("전송 후 이전 소유자의 hasAccess는 false, 새 소유자는 true가 된다", async function () {
      const { sau1155, minter, holder, other } = await loadFixture(deployFixture);

      await sau1155.connect(minter).mint(holder.address, 1, 1, CONTENT_HASH);
      expect(await sau1155.hasAccess(holder.address, 1)).to.equal(true);
      expect(await sau1155.hasAccess(other.address, 1)).to.equal(false);

      await sau1155
        .connect(holder)
        .safeTransferFrom(holder.address, other.address, 1, 1, "0x");

      expect(await sau1155.hasAccess(holder.address, 1)).to.equal(false);
      expect(await sau1155.hasAccess(other.address, 1)).to.equal(true);
    });
  });

  describe("burn", function () {
    it("burn 후 balanceOf가 0이 된다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      await sau1155.connect(minter).mint(holder.address, 1, 1, CONTENT_HASH);
      expect(await sau1155.balanceOf(holder.address, 1)).to.equal(1);

      await sau1155.connect(holder).burn(holder.address, 1, 1);
      expect(await sau1155.balanceOf(holder.address, 1)).to.equal(0);
    });

    it("소유자도 승인받은 주체도 아니면 burn이 리버트된다", async function () {
      const { sau1155, minter, holder, other } = await loadFixture(deployFixture);

      await sau1155.connect(minter).mint(holder.address, 1, 1, CONTENT_HASH);

      await expect(sau1155.connect(other).burn(holder.address, 1, 1)).to.be.reverted;
    });

    it("[3-5] 전량 burn 후 콘텐츠 메타데이터가 정리된다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      await sau1155
        .connect(minter)
        .mintWithMetadata(holder.address, 1, 1, CONTENT_HASH, TOKEN_URI);
      await sau1155.connect(holder).burn(holder.address, 1, 1);

      const [contentHash, creator] = await sau1155.getTokenInfo(1);
      expect(contentHash).to.equal("");
      expect(creator).to.equal(ethers.ZeroAddress);
    });
  });

  describe("[3-5] mintBatch — 모든 tokenId에 대해 이벤트 발생", function () {
    it("mintBatch는 배치의 모든 tokenId에 대해 ContentCreated/AccessGranted를 발생시킨다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      const ids = [10, 11, 12];
      const amounts = [1, 1, 1];
      const hashes = ["hash-10", "hash-11", "hash-12"];

      const tx = await sau1155
        .connect(minter)
        .mintBatch(holder.address, ids, amounts, hashes);
      const receipt = await tx.wait();

      const contentCreatedLogs = receipt!.logs.filter((log: any) => {
        try {
          return sau1155.interface.parseLog(log)?.name === "ContentCreated";
        } catch {
          return false;
        }
      });
      const accessGrantedLogs = receipt!.logs.filter((log: any) => {
        try {
          return sau1155.interface.parseLog(log)?.name === "AccessGranted";
        } catch {
          return false;
        }
      });

      expect(contentCreatedLogs.length).to.equal(ids.length);
      expect(accessGrantedLogs.length).to.equal(ids.length);

      for (const id of ids) {
        expect(await sau1155.balanceOf(holder.address, id)).to.equal(1);
      }
    });

    it("mintBatchWithMetadata도 배치의 모든 tokenId에 대해 이벤트를 발생시킨다", async function () {
      const { sau1155, minter, holder } = await loadFixture(deployFixture);

      const ids = [20, 21];
      const amounts = [1, 1];
      const hashes = ["hash-20", "hash-21"];
      const uris = ["https://example.com/20.json", "https://example.com/21.json"];

      const tx = await sau1155
        .connect(minter)
        .mintBatchWithMetadata(holder.address, ids, amounts, hashes, uris);
      const receipt = await tx.wait();

      const accessGrantedLogs = receipt!.logs.filter((log: any) => {
        try {
          return sau1155.interface.parseLog(log)?.name === "AccessGranted";
        } catch {
          return false;
        }
      });

      expect(accessGrantedLogs.length).to.equal(ids.length);
      expect(await sau1155.uri(20)).to.equal(uris[0]);
      expect(await sau1155.uri(21)).to.equal(uris[1]);
    });
  });

  describe("[3-4] 접근 제어 — Ownable 제거, AccessControl 단일화", function () {
    it("비-admin의 grantRole 호출은 리버트된다", async function () {
      const { sau1155, other, holder, MINTER_ROLE } = await loadFixture(deployFixture);

      await expect(sau1155.connect(other).grantRole(MINTER_ROLE, holder.address)).to.be
        .reverted;
    });

    it("admin(DEFAULT_ADMIN_ROLE 보유자)은 grantRole을 호출할 수 있다", async function () {
      const { sau1155, admin, other, MINTER_ROLE } = await loadFixture(deployFixture);

      await sau1155.connect(admin).grantRole(MINTER_ROLE, other.address);
      expect(await sau1155.hasRole(MINTER_ROLE, other.address)).to.equal(true);
    });

    it("비-admin의 setBaseURI 호출은 리버트된다", async function () {
      const { sau1155, other } = await loadFixture(deployFixture);

      await expect(sau1155.connect(other).setBaseURI("https://new-base/")).to.be.reverted;
    });

    it("컨트랙트에 owner()/grantMinterRole() 함수가 더 이상 존재하지 않는다", async function () {
      const { sau1155 } = await loadFixture(deployFixture);

      expect((sau1155 as any).owner).to.be.undefined;
      expect((sau1155 as any).grantMinterRole).to.be.undefined;
    });
  });

  describe("[3-3] receive() 제거 — ETH 영구 잠김 방지", function () {
    it("컨트랙트로 직접 ETH를 전송하면 리버트된다", async function () {
      const { sau1155, admin } = await loadFixture(deployFixture);
      const target = await sau1155.getAddress();

      await expect(
        admin.sendTransaction({ to: target, value: ethers.parseEther("1") })
      ).to.be.reverted;
    });
  });
});

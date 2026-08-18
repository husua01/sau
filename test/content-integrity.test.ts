import { expect } from "chai";
import { normalizeDataPayload } from "../src/lib/arweave";
import { resolveTokenURI, isValidArweaveId } from "../src/lib/blockchain";
import {
  createAccessControlConditions,
  describeAccessConditionMismatch,
} from "../src/lib/lit-protocol";
import { byteQuota } from "../src/lib/rate-limit";

// 여기 있는 두 함수는 "조용히 틀리는" 종류의 코드라 검증을 남겨둔다.
// - normalizeDataPayload: 잘못되면 에러 없이 암호문이 손상되고, 손상 사실은
//   몇 분 뒤 복호화 단계에서야 드러난다(그때는 원본 Blob이 이미 삭제된 뒤다).
// - resolveTokenURI: 잘못되면 에러 없이 서버가 공격자가 지정한 주소를 대신 조회한다.

describe("arweave.normalizeDataPayload", () => {
  // 회귀 방지: "base64처럼 생겼으면 디코딩" 휴리스틱이 Lit 암호문을 항상 오탐해
  // 모든 콘텐츠를 영구히 복호화 불가능하게 만들었다.
  it("표준 base64 문자열(= Lit 암호문 형태)을 그대로 왕복시킨다", () => {
    const ciphertext = Buffer.from(
      "lit ciphertext bytes ".repeat(32),
    ).toString("base64");
    expect(ciphertext).to.match(/^[A-Za-z0-9+/=]+$/);
    expect(ciphertext.length % 4).to.equal(0);

    const stored = normalizeDataPayload(ciphertext);
    expect(stored.toString("utf8")).to.equal(ciphertext);
  });

  it("data: URL처럼 생긴 문자열도 디코딩하지 않고 그대로 저장한다", () => {
    const literal = "data:text/plain;base64,SGVsbG8=";
    expect(normalizeDataPayload(literal).toString("utf8")).to.equal(literal);
  });

  it("멀티바이트 문자열을 UTF-8 바이트 수로 저장한다", () => {
    // 호출부의 크기 검사(Buffer.byteLength(content, 'utf8'))와 같은 기준이어야 한다.
    const stored = normalizeDataPayload("한글");
    expect(stored.length).to.equal(6);
    expect(stored.toString("utf8")).to.equal("한글");
  });

  it("Buffer는 손대지 않고 통과시킨다", () => {
    const buf = Buffer.from([0x00, 0xff, 0x80]);
    expect(normalizeDataPayload(buf).equals(buf)).to.equal(true);
  });
});

describe("blockchain.resolveTokenURI (SSRF 방어)", () => {
  it("ipfs://를 공개 게이트웨이 URL로 바꾼다", () => {
    expect(resolveTokenURI("ipfs://QmHash123")).to.equal(
      "https://ipfs.io/ipfs/QmHash123",
    );
  });

  it("허용된 게이트웨이의 https URL은 통과시킨다", () => {
    expect(resolveTokenURI("https://gateway.pinata.cloud/ipfs/QmHash")).to.equal(
      "https://gateway.pinata.cloud/ipfs/QmHash",
    );
  });

  it("[가장 중요] 클라우드 메타데이터 주소를 거부한다", () => {
    // 누구나 mintOwn으로 이런 tokenURI를 심을 수 있다.
    expect(() =>
      resolveTokenURI("http://169.254.169.254/latest/meta-data/"),
    ).to.throw();
  });

  it("내부 주소·임의 외부 호스트를 거부한다", () => {
    expect(() => resolveTokenURI("http://localhost:8545")).to.throw();
    expect(() => resolveTokenURI("https://attacker.example/leak")).to.throw();
    expect(() => resolveTokenURI("file:///etc/passwd")).to.throw();
  });

  it("빈 값과 형식이 깨진 값을 거부한다", () => {
    expect(() => resolveTokenURI("")).to.throw();
    expect(() => resolveTokenURI("not a url")).to.throw();
  });
});

describe("lit-protocol.describeAccessConditionMismatch (구매 전 검증)", () => {
  const CONTRACT = "0x1111111111111111111111111111111111111111";
  const TOKEN = "12345";

  it("정상 생성된 조건은 통과한다(대소문자 무관)", () => {
    const ok = createAccessControlConditions(CONTRACT, TOKEN, "sepolia");
    expect(describeAccessConditionMismatch(ok, CONTRACT, TOKEN)).to.equal(null);
    expect(
      describeAccessConditionMismatch(ok, CONTRACT.toUpperCase(), TOKEN),
    ).to.equal(null);
  });

  it("[가장 중요] 조건이 다른 토큰을 가리키면 잡아낸다", () => {
    // 악의적 창작자: 토큰 12345를 팔면서 콘텐츠는 자기가 계속 보유할 999로 암호화.
    const scam = createAccessControlConditions(CONTRACT, "999", "sepolia");
    const warning = describeAccessConditionMismatch(scam, CONTRACT, TOKEN);
    expect(warning).to.be.a("string");
    expect(warning).to.contain("999");
  });

  it("조건이 다른 컨트랙트를 가리키면 잡아낸다", () => {
    const other = createAccessControlConditions(
      "0x2222222222222222222222222222222222222222",
      TOKEN,
      "sepolia",
    );
    expect(describeAccessConditionMismatch(other, CONTRACT, TOKEN)).to.be.a(
      "string",
    );
  });

  it("항상 참이 되도록 조작된 판정식을 잡아낸다", () => {
    const [base] = createAccessControlConditions(CONTRACT, TOKEN, "sepolia");
    const alwaysTrue = [
      { ...base, returnValueTest: { key: "", comparator: "=", value: "false" } },
    ];
    expect(describeAccessConditionMismatch(alwaysTrue, CONTRACT, TOKEN)).to.be.a(
      "string",
    );
  });

  it("요청자 본인이 아닌 고정 주소를 검사하는 조건을 잡아낸다", () => {
    const [base] = createAccessControlConditions(CONTRACT, TOKEN, "sepolia");
    const pinned = [
      {
        ...base,
        functionParams: [
          "0xdeadbeef00000000000000000000000000000000",
          TOKEN,
          "3600",
        ],
      },
    ];
    expect(describeAccessConditionMismatch(pinned, CONTRACT, TOKEN)).to.be.a(
      "string",
    );
  });

  it("[대여 방어 우회] 보유 기간 검사를 balanceOf로 되돌린 조건을 잡아낸다", () => {
    // 옛 형식(ERC1155 balanceOf > 0)은 몇 분 빌려서 복호화하는 경로를 열어준다.
    const legacy = [
      {
        contractAddress: CONTRACT,
        standardContractType: "ERC1155",
        chain: "sepolia",
        method: "balanceOf",
        parameters: [":userAddress", TOKEN],
        returnValueTest: { comparator: ">", value: "0" },
      },
    ];
    expect(describeAccessConditionMismatch(legacy, CONTRACT, TOKEN)).to.be.a(
      "string",
    );
  });

  it("[함수 서명 조작] 이름만 hasHeldFor인 다른 서명을 잡아낸다", () => {
    const [base] = createAccessControlConditions(CONTRACT, TOKEN, "sepolia");
    const forged = [
      {
        ...base,
        functionAbi: {
          ...(base as any).functionAbi,
          inputs: [{ internalType: "address", name: "account", type: "address" }],
        },
      },
    ];
    expect(describeAccessConditionMismatch(forged, CONTRACT, TOKEN)).to.be.a(
      "string",
    );
  });

  it("최소 보유 기간이 조건에 담겨 있다", () => {
    const [c] = createAccessControlConditions(CONTRACT, TOKEN, "sepolia", 7200);
    expect((c as any).functionParams[2]).to.equal("7200");
    expect(describeAccessConditionMismatch([c], CONTRACT, TOKEN)).to.equal(null);
  });

  it("조건이 여러 개거나 형식이 아니면 거부한다", () => {
    const ok = createAccessControlConditions(CONTRACT, TOKEN, "sepolia");
    expect(describeAccessConditionMismatch([...ok, ...ok], CONTRACT, TOKEN)).to
      .be.a("string");
    expect(describeAccessConditionMismatch(null, CONTRACT, TOKEN)).to.be.a(
      "string",
    );
  });
});

describe("rate-limit.byteQuota (Arweave 대납 소진 방어)", () => {
  it("누적 바이트가 상한을 넘으면 거부한다", () => {
    const key = `test-${Math.random()}`;
    expect(byteQuota(key, 60, 100, 60_000)).to.equal(true);
    expect(byteQuota(key, 30, 100, 60_000)).to.equal(true); // 누적 90
    expect(byteQuota(key, 30, 100, 60_000)).to.equal(false); // 120 → 거부
    // 거부된 요청은 누적에 반영되지 않아야 한다
    expect(byteQuota(key, 10, 100, 60_000)).to.equal(true); // 누적 100
  });

  it("단건이 상한보다 크면 첫 요청부터 거부한다", () => {
    expect(byteQuota(`test-${Math.random()}`, 200, 100, 60_000)).to.equal(false);
  });

  it("키(주소)가 다르면 독립적으로 집계된다", () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;
    expect(byteQuota(a, 100, 100, 60_000)).to.equal(true);
    expect(byteQuota(a, 1, 100, 60_000)).to.equal(false);
    expect(byteQuota(b, 100, 100, 60_000)).to.equal(true);
  });

  it("[지갑 갈아타기 방어] 전역 상한은 주소를 바꿔도 함께 소진된다", () => {
    // 주소별 상한만 있으면 공격자가 지갑을 갈아타며 상한을 무한히 다시 받는다.
    // route.ts는 전역 키를 먼저 확인하므로, 그 동작을 여기서 고정한다.
    const globalKey = `test-global-${Math.random()}`;
    const limit = 100;

    for (const addr of ["0xaaa", "0xbbb", "0xccc"]) {
      const perAddr = `${globalKey}:${addr}`;
      // 주소별로는 매번 여유가 있지만…
      expect(byteQuota(perAddr, 40, limit, 60_000)).to.equal(true);
    }
    // …전역 카운터는 세 주소의 합계를 본다
    expect(byteQuota(globalKey, 40, limit, 60_000)).to.equal(true);
    expect(byteQuota(globalKey, 40, limit, 60_000)).to.equal(true);
    expect(byteQuota(globalKey, 40, limit, 60_000)).to.equal(false);
  });

  it("창이 지나면 다시 허용된다", async () => {
    const key = `test-${Math.random()}`;
    // 창을 1ms로 잡으면 "거부" 확인 직전에 창이 만료돼 버려 테스트가 간헐 실패한다.
    // 거부 판정이 만료와 경합하지 않을 만큼 창을 넉넉히 두고, 대기는 그보다 훨씬 길게 준다.
    const WINDOW_MS = 50;
    expect(byteQuota(key, 100, 100, WINDOW_MS)).to.equal(true);
    expect(byteQuota(key, 100, 100, WINDOW_MS)).to.equal(false);

    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS * 4));

    expect(byteQuota(key, 100, 100, WINDOW_MS)).to.equal(true);
  });
});

describe("blockchain.isValidArweaveId", () => {
  it("43자 base64url만 통과시킨다", () => {
    expect(isValidArweaveId("a".repeat(43))).to.equal(true);
    expect(isValidArweaveId("a".repeat(42))).to.equal(false);
    expect(isValidArweaveId("../../etc/passwd")).to.equal(false);
    expect(isValidArweaveId(null)).to.equal(false);
  });
});

import { ethers } from "ethers";

const NONCE_TTL_MS = 5 * 60 * 1000;

// 개발용 인메모리 저장소. 프로덕션 다중 인스턴스 환경에서는 Redis 등으로 교체 필요.
const usedNonces = new Map<string, number>();

function pruneNonces() {
  const now = Date.now();
  for (const [nonce, ts] of usedNonces) {
    if (now - ts > NONCE_TTL_MS) usedNonces.delete(nonce);
  }
}

export type SiweCheck = { ok: true } | { ok: false; reason: string };

export function verifySiwe(
  message: string,
  signature: string,
  expectedAddress: string,
): SiweCheck {
  if (!message || !signature || !expectedAddress) {
    return {
      ok: false,
      reason: "Missing siweMessage, siweSignature or address",
    };
  }

  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    return { ok: false, reason: "Invalid signature" };
  }

  if (recovered.toLowerCase() !== expectedAddress.toLowerCase()) {
    return { ok: false, reason: "Signature does not match address" };
  }

  const nonce = message.match(/Nonce: (\S+)/)?.[1];
  const issuedAtRaw = message.match(/Issued At: (\S+)/)?.[1];
  if (!nonce || !issuedAtRaw) {
    return { ok: false, reason: "Malformed SIWE message" };
  }

  const issuedAt = Date.parse(issuedAtRaw);
  if (Number.isNaN(issuedAt) || Date.now() - issuedAt > NONCE_TTL_MS) {
    return { ok: false, reason: "Expired message" };
  }

  pruneNonces();
  if (usedNonces.has(nonce)) {
    return { ok: false, reason: "Nonce already used" };
  }
  usedNonces.set(nonce, Date.now());

  return { ok: true };
}

export function buildSiweMessage(
  address: string,
  domain: string,
  statement: string,
) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    statement,
    "",
    `URI: https://${domain}`,
    `Version: 1`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { processTextAsFile, type EncryptionPayload } from "@/lib/file-encryption";
import { initLitClient, decryptWithLit } from "@/lib/lit-protocol";

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

function pretty(value: JsonValue): string {
 try {
 return JSON.stringify(value, null, 2);
 } catch {
 return String(value);
 }
}

const CONTRACT_FALLBACK =
 process.env.NEXT_PUBLIC_SAU_CONTRACT_ADDRESS ||
 process.env.SAU_CONTRACT_ADDRESS ||
 "0x64cAf3Bd2F96304Ee8Dc3D46Ea816B2e5bfbB902";

const DEFAULTS = {
 arweaveContent:
 process.env.NEXT_PUBLIC_TEST_ARWEAVE_CONTENT || "lit debug sample",
 arweaveFileName:
 process.env.NEXT_PUBLIC_TEST_ARWEAVE_FILENAME || "lit-debug.txt",
 arweaveMime:
 process.env.NEXT_PUBLIC_TEST_ARWEAVE_MIMETYPE || "text/plain",
 arweaveUserAddress:
 process.env.NEXT_PUBLIC_TEST_ARWEAVE_USER_ADDRESS || "",
 arweaveGateway:
 process.env.NEXT_PUBLIC_TEST_ARWEAVE_GATEWAY || "https://arweave.net",
 arweaveFetchId: process.env.NEXT_PUBLIC_TEST_ARWEAVE_FETCH_ID || "",
 litText: process.env.NEXT_PUBLIC_TEST_LIT_TEXT || "lit protocol test payload",
 litFileName:
 process.env.NEXT_PUBLIC_TEST_LIT_FILENAME || "lit-debug.txt",
 litTokenId: process.env.NEXT_PUBLIC_TEST_LIT_TOKEN_ID || "1",
 litContract:
 process.env.NEXT_PUBLIC_TEST_LIT_CONTRACT ||
 CONTRACT_FALLBACK,
};

export default function LitArweaveDebugPage() {
 // Arweave state
 const [arweaveContent, setArweaveContent] = useState(DEFAULTS.arweaveContent);
 const [arweaveFileName, setArweaveFileName] = useState(DEFAULTS.arweaveFileName);
 const [arweaveMime, setArweaveMime] = useState(DEFAULTS.arweaveMime);
 const [arweaveUserAddress, setArweaveUserAddress] = useState(DEFAULTS.arweaveUserAddress);
 const [arweaveUploading, setArweaveUploading] = useState(false);
 const [arweaveUploadResult, setArweaveUploadResult] = useState<JsonValue>(null);

 const [arweaveFetchId, setArweaveFetchId] = useState(DEFAULTS.arweaveFetchId);
 const [arweaveGateway, setArweaveGateway] = useState(DEFAULTS.arweaveGateway);
 const [arweaveFetchLoading, setArweaveFetchLoading] = useState(false);
 const [arweaveFetchedText, setArweaveFetchedText] = useState<string>("");
 const [arweaveFetchError, setArweaveFetchError] = useState<string>("");

 // Lit state
 const [litText, setLitText] = useState(DEFAULTS.litText);
 const [litFileName, setLitFileName] = useState(DEFAULTS.litFileName);
 const [litTokenId, setLitTokenId] = useState(DEFAULTS.litTokenId);
 const [litContract, setLitContract] = useState(DEFAULTS.litContract);
 const [litEncrypting, setLitEncrypting] = useState(false);
 const [litPayload, setLitPayload] = useState<EncryptionPayload | null>(null);
 const [litError, setLitError] = useState<string>("");
 const [litDecrypting, setLitDecrypting] = useState(false);
 const [litDecryptedText, setLitDecryptedText] = useState<string>("");
 const [litDecryptError, setLitDecryptError] = useState<string>("");

 const litPayloadSummary = useMemo(() => {
 if (!litPayload) return null;
 const summary = {
 encryptionType: litPayload.encryptionType,
 hasCiphertext: !!(litPayload as any).ciphertext,
 hasEncryptedFile: Array.isArray((litPayload as any).encryptedFile),
 accessControlConditions: litPayload.accessControlConditions,
 mimeType: litPayload.mimeType,
 encoding: litPayload.encoding,
 };
 return summary;
 }, [litPayload]);

 async function handleArweaveUpload() {
 const trimmedContent = arweaveContent.trim();
 const trimmedFileName = arweaveFileName.trim();
 const trimmedUserAddress = arweaveUserAddress.trim();

 if (!trimmedContent) {
 setArweaveUploadResult({
  ok: false,
  error: "콘텐츠 내용을 입력하세요.",
 });
 return;
 }

 if (!trimmedFileName) {
 setArweaveUploadResult({
  ok: false,
  error: "파일명을 입력하세요.",
 });
 return;
 }

 if (!trimmedUserAddress) {
 setArweaveUploadResult({
  ok: false,
  error: "userAddress(지갑 주소)는 필수입니다. `.env.local`의 NEXT_PUBLIC_TEST_ARWEAVE_USER_ADDRESS 값을 확인하세요.",
 });
 return;
 }

 setArweaveUploading(true);
 setArweaveUploadResult(null);

 try {
 const body = {
  action: "upload_shared_content",
  content: trimmedContent,
  fileName: trimmedFileName,
  contentType: arweaveMime || "text/plain",
  contentEncoding: "utf-8",
  userAddress: trimmedUserAddress,
  debug: true,
  requestedAt: new Date().toISOString(),
 };

 const response = await fetch("/api/unified", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
 });

 const data = await response.json();

 setArweaveUploadResult({
  ok: response.ok,
  status: response.status,
  request: body,
  response: data,
 });
 } catch (error) {
 setArweaveUploadResult({
  ok: false,
  error: error instanceof Error ? error.message : String(error),
 });
 } finally {
 setArweaveUploading(false);
 }
 }

 async function handleArweaveFetch() {
 setArweaveFetchedText("");
 setArweaveFetchError("");

 if (!arweaveFetchId.trim()) {
 setArweaveFetchError("Arweave ID를 입력하세요. 업로드 후 응답에 포함된 `contentId` 값을 복사하면 됩니다.");
 return;
 }

 const baseUrl = arweaveGateway.trim().replace(/\/+$/, "");
 const targetUrl = `${baseUrl}/${arweaveFetchId.trim()}`;

 setArweaveFetchLoading(true);
 try {
 const response = await fetch(targetUrl, { cache: "no-store" });
 const text = await response.text();

 if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
 }

 setArweaveFetchedText(text);
 } catch (error) {
 setArweaveFetchError(error instanceof Error ? error.message : String(error));
 } finally {
 setArweaveFetchLoading(false);
 }
 }

 async function handleLitEncrypt() {
 setLitError("");
 setLitPayload(null);
 setLitDecryptedText("");
 setLitDecryptError("");

 if (!litText.trim()) {
 setLitError("암호화할 텍스트를 입력하세요.");
 return;
 }

 const numericTokenId = Number(litTokenId || "0");
 if (!Number.isInteger(numericTokenId) || numericTokenId < 0) {
 setLitError("Token ID는 0 이상의 정수여야 합니다.");
 return;
 }

 setLitEncrypting(true);

 try {
 await initLitClient();

 const payload = await processTextAsFile(
  litText,
  litFileName || "lit-debug.txt",
  "0x0",
  numericTokenId,
  litContract || CONTRACT_FALLBACK,
 );

 setLitPayload(payload);
 } catch (error) {
 setLitError(error instanceof Error ? error.message : String(error));
 } finally {
 setLitEncrypting(false);
 }
 }

 async function handleLitDecrypt() {
 if (!litPayload || litPayload.encryptionType !== "lit-protocol") {
 setLitDecryptError("Lit Protocol 결과가 없어서 복호화할 수 없습니다.");
 return;
 }

 const { ciphertext, dataToEncryptHash, accessControlConditions } = litPayload as unknown as {
 ciphertext: string;
 dataToEncryptHash: string;
 accessControlConditions: any[];
 };

 setLitDecryptError("");
 setLitDecryptedText("");
 setLitDecrypting(true);

 try {
 const decrypted = await decryptWithLit(
  ciphertext,
  dataToEncryptHash,
  accessControlConditions,
 );
 setLitDecryptedText(decrypted || "");
 } catch (error) {
 setLitDecryptError(error instanceof Error ? error.message : String(error));
 } finally {
 setLitDecrypting(false);
 }
 }

 return (
 <div
 style={{
  maxWidth: "960px",
  margin: "0 auto",
  padding: "32px 16px 64px",
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: "#0f172a",
 }}
 >
 <header style={{ marginBottom: "32px" }}>
  <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>
   Lit & Arweave 디버그 허브
  </h1>
  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "12px" }}>
  /create 페이지에서 사용하는 Lit Protocol 암호화와 Arweave 업로드 로직을 개별적으로 실험하고 로그를 수집할 수 있는 페이지입니다.
  실제 네트워크와 연결되므로 테스트 전에 환경 변수가 모두 설정되어 있는지 확인하세요.
  </p>
  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
  <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
   홈
  </Link>
  <Link href="/create" style={{ color: "#2563eb", textDecoration: "none" }}>
  생성 페이지
  </Link>
  <Link href="/access" style={{ color: "#2563eb", textDecoration: "none" }}>
  데이터 접근
  </Link>
  </div>
 </header>

 {/* Arweave Section */}
 <section
  style={{
  border: "1px solid #cbd5f5",
  borderRadius: "12px",
  padding: "24px",
  marginBottom: "32px",
  background: "#f8fafc",
  }}
 >
  <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
   Arweave 업로드 테스트
  </h2>
  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "16px" }}>
  `/api/unified`의 <code>upload_shared_content</code> 액션을 호출합니다. <strong>콘텐츠, 파일명, userAddress</strong>는 필수이며,
  서버 콘솔에서 ` Arweave 업로드 시작...` 로그로 업로드 과정을 확인할 수 있습니다.
  </p>

  <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
  <textarea
  value={arweaveContent}
  onChange={(event) => setArweaveContent(event.target.value)}
  placeholder="업로드할 텍스트를 입력하세요"
  rows={6}
  style={{
   width: "100%",
   padding: "12px",
   borderRadius: "8px",
   border: "1px solid #cbd5f5",
   resize: "vertical",
   fontFamily: "monospace",
  }}
  />

  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
  <label style={{ display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" }}>
   파일명
   <input
   value={arweaveFileName}
   onChange={(event) => setArweaveFileName(event.target.value)}
   placeholder="lit-debug.txt"
   style={{
   padding: "10px",
   borderRadius: "6px",
   border: "1px solid #cbd5f5",
   }}
   />
  </label>
  <label style={{ display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" }}>
   MIME Type
   <input
   value={arweaveMime}
   onChange={(event) => setArweaveMime(event.target.value)}
   placeholder="text/plain"
   style={{
   padding: "10px",
   borderRadius: "6px",
   border: "1px solid #cbd5f5",
   }}
   />
  </label>
  <label style={{ display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" }}>
   User Address
   <input
   value={arweaveUserAddress}
   onChange={(event) => setArweaveUserAddress(event.target.value)}
   placeholder="0x... (필수)"
   style={{
   padding: "10px",
   borderRadius: "6px",
   border: "1px solid #cbd5f5",
   fontFamily: "monospace",
   }}
   required
   />
  </label>
  </div>

  <button
  type="button"
  onClick={handleArweaveUpload}
  disabled={arweaveUploading}
  style={{
   padding: "12px 18px",
   background: arweaveUploading ? "#94a3b8" : "#2563eb",
   color: "white",
   border: "none",
   borderRadius: "8px",
   cursor: arweaveUploading ? "not-allowed" : "pointer",
   fontWeight: 600,
  }}
  >
  {arweaveUploading ? "업로드 중..." : "Arweave 업로드 실행"}
  </button>
  </div>

  {arweaveUploadResult && (
  <div
  style={{
   marginTop: "16px",
   background: "white",
   borderRadius: "8px",
   padding: "16px",
   border: "1px solid #cbd5f5",
   fontFamily: "monospace",
   fontSize: "13px",
   whiteSpace: "pre-wrap",
  }}
  >
  {pretty(arweaveUploadResult)}
  </div>
  )}

  <hr style={{ margin: "24px 0", borderColor: "#e2e8f0" }} />

  <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
   업로드 결과 확인
  </h3>
  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "12px" }}>
  업로드 응답의 <code>contentId</code> 값을 아래 Arweave ID에 붙여 넣어 실제 게이트웨이에서 데이터를 확인합니다.
  </p>

  <div
  style={{
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  marginBottom: "12px",
  }}
  >
  <label style={{ display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" }}>
  Arweave ID
  <input
   value={arweaveFetchId}
   onChange={(event) => setArweaveFetchId(event.target.value)}
   placeholder="예: Qmnftcontent..."
   style={{
   padding: "10px",
   borderRadius: "6px",
   border: "1px solid #cbd5f5",
   fontFamily: "monospace",
   }}
  />
  </label>
  <label style={{ display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" }}>
  게이트웨이
  <input
   value={arweaveGateway}
   onChange={(event) => setArweaveGateway(event.target.value)}
   placeholder="https://arweave.net"
   style={{
   padding: "10px",
   borderRadius: "6px",
   border: "1px solid #cbd5f5",
   fontFamily: "monospace",
   }}
  />
  </label>
  </div>

  <button
  type="button"
  onClick={handleArweaveFetch}
  disabled={arweaveFetchLoading}
  style={{
  padding: "10px 16px",
  background: arweaveFetchLoading ? "#94a3b8" : "#0ea5e9",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: arweaveFetchLoading ? "not-allowed" : "pointer",
  fontWeight: 600,
  marginBottom: "12px",
  }}
  >
  {arweaveFetchLoading ? "조회 중..." : "Arweave 게이트웨이 호출"}
  </button>

  {arweaveFetchError && (
  <div style={{ color: "#dc2626", fontSize: "14px", marginBottom: "8px" }}>
  {arweaveFetchError}
  </div>
  )}
  {arweaveFetchedText && (
  <div
  style={{
   background: "white",
   borderRadius: "8px",
   padding: "16px",
   border: "1px solid #cbd5f5",
   fontFamily: "monospace",
   fontSize: "13px",
   whiteSpace: "pre-wrap",
   maxHeight: "220px",
   overflowY: "auto",
  }}
  >
  {arweaveFetchedText}
  </div>
  )}
 </section>

 {/* Lit Section */}
 <section
  style={{
  border: "1px solid #cbd5f5",
  borderRadius: "12px",
  padding: "24px",
  background: "#fefce8",
  }}
 >
  <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
   Lit Protocol 암호화 테스트
  </h2>
  <p style={{ color: "#92400e", lineHeight: 1.6, marginBottom: "16px" }}>
  브라우저에서 바로 <code>processTextAsFile</code>을 호출하여 Lit 암호화를 수행합니다. MetaMask 로그인/서명이 필요할 수 있습니다.
  암호화 결과와 접근 제어 조건을 한눈에 확인하고, 필요 시 즉시 복호화 테스트를 반복할 수 있습니다.
  </p>

  <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
  <textarea
  value={litText}
  onChange={(event) => setLitText(event.target.value)}
  rows={6}
  placeholder="암호화할 텍스트를 입력하세요"
  style={{
   width: "100%",
   padding: "12px",
   borderRadius: "8px",
   border: "1px solid #facc15",
   resize: "vertical",
   fontFamily: "monospace",
  }}
  />

  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
  <label style={{ display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" }}>
   파일명
   <input
   value={litFileName}
   onChange={(event) => setLitFileName(event.target.value)}
   placeholder="lit-debug.txt"
   style={{
   padding: "10px",
   borderRadius: "6px",
   border: "1px solid #facc15",
   }}
   />
  </label>
  <label style={{ display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" }}>
   Token ID
   <input
   value={litTokenId}
   onChange={(event) => setLitTokenId(event.target.value)}
   placeholder="1"
   style={{
   padding: "10px",
   borderRadius: "6px",
   border: "1px solid #facc15",
   fontFamily: "monospace",
   }}
   />
  </label>
  <label style={{ display: "flex", flexDirection: "column", fontSize: "14px", gap: "6px" }}>
   컨트랙트 주소
   <input
   value={litContract}
   onChange={(event) => setLitContract(event.target.value)}
   placeholder={CONTRACT_FALLBACK}
   style={{
   padding: "10px",
   borderRadius: "6px",
   border: "1px solid #facc15",
   fontFamily: "monospace",
   }}
   />
  </label>
  </div>

  <button
  type="button"
  onClick={handleLitEncrypt}
  disabled={litEncrypting}
  style={{
   padding: "12px 18px",
   background: litEncrypting ? "#94a3b8" : "#f59e0b",
   color: "white",
   border: "none",
   borderRadius: "8px",
   cursor: litEncrypting ? "not-allowed" : "pointer",
   fontWeight: 600,
  }}
  >
  {litEncrypting ? "암호화 중..." : "Lit 암호화 실행"}
  </button>
  </div>

  {litError && (
  <div style={{ color: "#b91c1c", fontSize: "14px", marginBottom: "12px" }}>{litError}</div>
  )}

  {litPayload && (
  <div style={{ display: "grid", gap: "16px", marginTop: "12px" }}>
  <div
   style={{
   background: "white",
   borderRadius: "8px",
   padding: "16px",
   border: "1px solid #facc15",
   fontFamily: "monospace",
   fontSize: "13px",
   whiteSpace: "pre-wrap",
   }}
  >
   {pretty(litPayloadSummary)}
  </div>
  <details>
   <summary style={{ cursor: "pointer", fontWeight: 600, color: "#b45309" }}>
   전체 Payload 보기
   </summary>
   <pre
   style={{
   marginTop: "12px",
   background: "white",
   borderRadius: "8px",
   padding: "16px",
   border: "1px solid #facc15",
   fontFamily: "monospace",
   fontSize: "13px",
   whiteSpace: "pre-wrap",
   }}
   >
{pretty(litPayload as JsonValue)}
   </pre>
  </details>

  <div>
   <button
   type="button"
   onClick={handleLitDecrypt}
   disabled={litDecrypting || !litPayload || litPayload.encryptionType !== "lit-protocol"}
   style={{
   padding: "10px 16px",
   background:
    !litPayload || litPayload.encryptionType !== "lit-protocol"
    ? "#94a3b8"
    : litDecrypting
    ? "#94a3b8"
    : "#22c55e",
   color: "white",
   border: "none",
   borderRadius: "8px",
   cursor:
    !litPayload || litPayload.encryptionType !== "lit-protocol" || litDecrypting
    ? "not-allowed"
    : "pointer",
   fontWeight: 600,
   }}
   >
   {litDecrypting ? "복호화 중..." : "즉시 복호화 테스트"}
   </button>

   {litDecryptError && (
   <div style={{ color: "#b91c1c", fontSize: "14px", marginTop: "8px" }}>{litDecryptError}</div>
   )}
   {litDecryptedText && (
   <div
   style={{
    marginTop: "12px",
    background: "#ecfdf5",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid #bbf7d0",
    fontFamily: "monospace",
    fontSize: "13px",
    whiteSpace: "pre-wrap",
   }}
   >
   {litDecryptedText}
   </div>
   )}
  </div>
  </div>
  )}
 </section>
 </div>
 );
}



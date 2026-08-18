"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import {
  processTextAsFile,
  encryptFile,
  downloadFile,
} from "@/lib/file-encryption";
import {
  initLitClient,
  encryptWithLit,
  createAccessControlConditions,
  MIN_HOLDING_SECONDS,
} from "@/lib/lit-protocol";
import { buildSiweMessage } from "@/lib/auth";
import { upload as uploadToBlob } from "@vercel/blob/client";

const EXPECTED_CHAIN_ID = 11155111n; // Sepolia 테스트넷

// connectWallet / accountsChanged 양쪽에서 공유하는 체인 확인 로직.
// 리버트를 막는 강제 차단은 아니고, 사용자에게 알려주는 용도다.
function warnIfWrongChain(chainId: bigint) {
  if (chainId !== EXPECTED_CHAIN_ID) {
    alert(
      `Sepolia 테스트넷(Chain ID: ${EXPECTED_CHAIN_ID})으로 전환해주세요.\n\n현재 네트워크: Chain ID ${chainId.toString()}`,
    );
  }
}

// SIWE 서명 3종(주소/메시지/서명)을 만드는 공통 헬퍼. auth.ts의 verifySiwe는
// nonce를 1회용으로 소비하므로(재사용 시 401) 매 호출마다 새로 서명을 요청한다.
// 서명은 어디에도 캐시하지 않는다(특히 localStorage 금지).
async function getSiweAuthFields(action: string) {
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    throw new Error("MetaMask가 설치되지 않았습니다.");
  }
  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const siweMessage = buildSiweMessage(
    address,
    window.location.host,
    `SAU: ${action}`,
  );
  const siweSignature = await signer.signMessage(siweMessage);

  return { userAddress: address, siweMessage, siweSignature };
}

// /api/unified 의 SIWE 보호 액션 호출용 헬퍼.
async function signedFetch(action: string, payload: Record<string, any>) {
  const auth = await getSiweAuthFields(action);

  // userAddress는 항상 방금 서명한 지갑 주소로 강제한다. 호출부가 넘긴 값(예: 지갑
  // 전환 전에 저장된 walletState.address)을 그대로 쓰면 서명자와 userAddress가 어긋나
  // 서버의 SIWE 검증이 매번 401로 실패한다.
  return fetch("/api/unified", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      ...payload,
      userAddress: auth.userAddress,
      siweMessage: auth.siweMessage,
      siweSignature: auth.siweSignature,
    }),
  });
}

// 컨트랙트의 mintOwn은 tokenId 상위 160비트가 호출자 주소와 같을 것을 요구한다
// (같은 id로 앞질러 민팅해 암호문을 가로채는 front-running 방지). 그래서 주소를
// 그대로 상위 비트에 싣고 하위 96비트만 무작위로 채운다.
// Math.random() 폴백은 두지 않는다 — crypto.getRandomValues가 없는 환경이면 Lit
// 암호화 자체가 동작하지 않고, 예측 가능한 tokenId를 만드느니 여기서 실패하는 게 낫다.
function generateTokenId(address: string) {
  const random = new Uint8Array(12); // 96비트
  crypto.getRandomValues(random);
  const suffix = BigInt(
    "0x" +
      Array.from(random, (b) => b.toString(16).padStart(2, "0")).join(""),
  );
  return ((BigInt(address) << 96n) | suffix).toString();
}
export default function CreateNFTPage() {
  const configuredContractAddress =
    process.env.NEXT_PUBLIC_SAU_CONTRACT_ADDRESS ||
    process.env.SAU_CONTRACT_ADDRESS;
  // 브라우저에서만 throw — 이 값이 없으면 next build의 정적 프리렌더 단계까지
  // 실패시키지 않으면서도, 실제 사용자에게는 하이드레이션 직후 즉시 에러를 노출한다.
  if (typeof window !== "undefined" && !configuredContractAddress) {
    throw new Error("NEXT_PUBLIC_SAU_CONTRACT_ADDRESS가 설정되지 않았습니다.");
  }

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [costEstimate, setCostEstimate] = useState<any>(null);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [walletState, setWalletState] = useState({
    isConnected: false,
    address: "",
    chainId: "",
    balance: "",
  });
  // 컨트랙트 주소 (환경변수 필수 — 미설정 시 브라우저에서 컴포넌트 진입 시점에 throw)
  const [contractAddress] = useState(configuredContractAddress ?? "");
  const [paymentStep, setPaymentStep] = useState<
    "estimate" | "payment" | "processing"
  >("estimate");
  const [inputMode, setInputMode] = useState<"text" | "file" | "image" | null>(
    null,
  );
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(
    null,
  );
  const [imageLoading, setImageLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);

  // 이미지 업로드 핸들러
  const handleImageUpload = (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    // 빠른 검증
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }

    // 서버(/api/upload-nft-image)의 MAX_IMAGE_BYTES와 맞춘다. 여기서 걸러야
    // 나머지 민팅 플로우(서명, 콘텐츠 업로드 등)를 다 거친 뒤에야 413으로
    // 뒤늦게 실패하는 걸 막을 수 있다.
    if (file.size > 4 * 1024 * 1024) {
      alert("이미지 크기는 4MB 이하여야 합니다.");
      return;
    }

    // 즉시 로딩 상태로 변경 (사용자 피드백)
    setImageLoading(true);

    try {
      if (coverImagePreview) {
        URL.revokeObjectURL(coverImagePreview);
      }

      const previewUrl = URL.createObjectURL(file);
      setCoverImage(file);
      setCoverImagePreview(previewUrl);
    } catch (error) {
      console.error("이미지 처리 실패:", error);
      alert("이미지 처리 중 오류가 발생했습니다.");
    } finally {
      setImageLoading(false);
    }
  };

  // 이미지 제거 핸들러
  const handleImageRemove = () => {
    // 메모리 누수 방지: Object URL 정리
    if (coverImagePreview) {
      URL.revokeObjectURL(coverImagePreview);
    }
    setCoverImage(null);
    setCoverImagePreview(null);

    // input 초기화
    if (coverImageInputRef.current) {
      coverImageInputRef.current.value = "";
    }
  };

  // 컴포넌트 언마운트 시 URL 정리
  useEffect(() => {
    return () => {
      if (coverImagePreview) {
        URL.revokeObjectURL(coverImagePreview);
      }
    };
  }, [coverImagePreview]);

  // MetaMask 연결 함수 (test 페이지와 동일)
  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        setLoading(true);

        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);

        if (accounts.length > 0) {
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          const network = await provider.getNetwork();
          const balance = await provider.getBalance(address);

          setWalletState({
            isConnected: true,
            address: address,
            chainId: network.chainId.toString(),
            balance: ethers.formatEther(balance),
          });

          setWalletAddress(address);
          setWalletConnected(true);
          setPaymentStep("payment");

          // 네트워크 확인 - Sepolia 테스트넷
          warnIfWrongChain(network.chainId);
        }
      } catch (error) {
        console.error("MetaMask 연결 실패:", error);
        alert("MetaMask 연결에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    } else {
      alert("MetaMask가 설치되어 있지 않습니다. MetaMask를 설치해주세요.");
    }
  };

  // 지갑 계정 전환 감지. walletState.address를 갱신하지 않으면 signedFetch가 새
  // 서명자와 다른(오래된) userAddress를 보내 모든 요청이 401로 실패한다.
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum?.on) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      // 아직 시작하지 않은 결제 단계는 새 계정 기준으로 다시 검증해야 하므로
      // 초기화한다. 단, 이미 진행 중인 민팅("processing")은 mintNFT 내부의
      // assertMintingAccountUnchanged가 별도로 감지해 중단시키므로 여기서
      // 건드리면 "생성하기" 버튼이 실제로는 트랜잭션이 진행 중인데도 마치
      // 아무 일도 없었던 것처럼 보이게 된다.
      setPaymentStep((prev) => (prev === "processing" ? prev : "estimate"));

      if (accounts.length === 0) {
        setWalletState({ isConnected: false, address: "", chainId: "", balance: "" });
        setWalletConnected(false);
        setWalletAddress("");
        return;
      }
      try {
        const provider = new ethers.BrowserProvider(ethereum);
        const address = accounts[0];
        const network = await provider.getNetwork();
        const balance = await provider.getBalance(address);

        setWalletState({
          isConnected: true,
          address,
          chainId: network.chainId.toString(),
          balance: ethers.formatEther(balance),
        });
        setWalletAddress(address);
        setWalletConnected(true);

        warnIfWrongChain(network.chainId);
      } catch (error) {
        console.error("지갑 계정 전환 처리 실패:", error);
      }
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  // SAU 컨트랙트 ABI (필수 함수들만)
  const SAU_ABI = [
    "function mint(address to, uint256 id, uint256 amount, string memory contentHash) external",
    "function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts, string[] calldata contentHashes) external",
    "function mintWithMetadata(address to, uint256 id, uint256 amount, string calldata contentHash, string calldata tokenURI) external",
    "function mintBatchWithMetadata(address to, uint256[] calldata ids, uint256[] calldata amounts, string[] calldata contentHashes, string[] calldata tokenURIs) external",
    "function mintOwn(uint256 id, uint256 amount, string calldata contentHash, string calldata tokenURI) external", // 본인 지갑 직접 민팅
    "function balanceOf(address account, uint256 id) view returns (uint256)",
    "function getTokenInfo(uint256 tokenId) view returns (string memory, address, uint256)",
    "function supportsInterface(bytes4 interfaceId) view returns (bool)",
    "function setTokenURI(uint256 tokenId, string calldata tokenURI) external", // MetaMask NFT 표시용
    "function uri(uint256 tokenId) view returns (string memory)", // Token URI 조회
  ];

  // NFT 민팅 함수 (여러 개 생성 지원)
  const mintNFT = async (formData: FormData) => {
    if (!walletState.address || !contractAddress) {
      alert("지갑을 연결하고 컨트랙트 주소를 확인해주세요.");
      return;
    }

    // 민팅 진행 중 지갑 계정이 전환되어도(accountsChanged) 이 트랜잭션에서는
    // 시작 시점의 주소를 일관되게 사용한다. 서명자(contract)도 이 시점에 고정되므로,
    // 메타데이터 태그와 실제 온체인 서명자가 어긋나는 것을 방지한다.
    //
    // 단, signedFetch는 항상 "현재 활성 계정"으로 서명하므로(계정 전환 후 401을
    // 막기 위한 설계 — commit 0d9e621), 서버로 보내는 SIWE 인증 자체는 mintingAddress를
    // 강제로 되돌릴 수 없다. 대신 서버 호출/온체인 트랜잭션 직전에 계정이 실제로
    // 바뀌었는지 확인해 불일치가 생기기 전에 민팅 자체를 중단한다.
    const mintingAddress = walletState.address;
    const assertMintingAccountUnchanged = async () => {
      const ethereum = (window as any).ethereum;
      const accounts: string[] = await ethereum.request({
        method: "eth_accounts",
      });
      const current = accounts[0]?.toLowerCase();
      if (!current || current !== mintingAddress.toLowerCase()) {
        throw new Error(
          "민팅 진행 중 지갑 계정이 변경되어 중단합니다. 처음부터 다시 시도해주세요.",
        );
      }
    };

    setPaymentStep("processing");
    setLoading(true);
    setMinting(true);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, SAU_ABI, signer);

      // 폼 데이터 처리
      const file = formData.get("file") as File;
      let content = (formData.get("text") as string) || "";
      let fileName = "content.txt";
      const nftTitle = (formData.get("title") as string) || "";
      const nftDescription = (formData.get("description") as string) || "";

      // 커버 이미지 처리 (Pinata IPFS 업로드)
      let coverImageUrl: string | null = null;
      let coverImageIpfsUrl: string | null = null;
      const metadataUploadCache = new Map<
        string,
        {
          tokenURI: string;
          source: "pinata-ipfs" | "pinata-gateway" | "pinata-metadata-api";
          ipfsHash: string | null;
        }
      >();
      const placeholderImageUrl =
        "https://via.placeholder.com/600x600.png?text=SAU+NFT";
      if (coverImage) {
        try {
          console.log(
            " 커버 이미지 Pinata IPFS 업로드 시작:",
            coverImage.name,
            coverImage.size,
            "bytes",
          );

          // Pinata IPFS에 업로드
          await assertMintingAccountUnchanged();
          const imageAuth = await getSiweAuthFields("upload_nft_image");
          const imageFormData = new FormData();
          imageFormData.append("image", coverImage);
          imageFormData.append("title", nftTitle || coverImage.name);
          imageFormData.append(
            "description",
            nftDescription || "NFT Cover Image",
          );
          imageFormData.append("userAddress", imageAuth.userAddress);
          imageFormData.append("siweMessage", imageAuth.siweMessage);
          imageFormData.append("siweSignature", imageAuth.siweSignature);

          const uploadResponse = await fetch("/api/upload-nft-image", {
            method: "POST",
            body: imageFormData,
          });

          const uploadData = await uploadResponse.json();

          if (uploadData.success) {
            coverImageUrl = uploadData.imageUrl;
            coverImageIpfsUrl = uploadData.image?.ipfsUrl || null;
            console.log(" 커버 이미지 Pinata IPFS 업로드 완료:", coverImageUrl);
          } else {
            console.warn(" Pinata 업로드 실패, base64로 폴백");
            // 폴백: base64로 변환
            const imageBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(coverImage);
            });
            coverImageUrl = imageBase64;
          }
        } catch (error) {
          console.error(" 커버 이미지 처리 실패:", error);
        }
      } else {
        console.log(" 커버 이미지 없음");
      }

      let isTextContent = false;
      let fileArrayBuffer: ArrayBuffer | null = null;

      if (file && file.size > 0) {
        fileName = file.name;
        try {
          fileArrayBuffer = await file.arrayBuffer();
        } catch (readError) {
          console.error("파일 읽기 실패:", readError);
          alert("파일을 읽는 중 오류가 발생했습니다.");
          setLoading(false);
          setMinting(false);
          return;
        }
      } else {
        // 파일이 없으면 텍스트 콘텐츠를 파일로 변환
        isTextContent = true;
        fileName = `nft_content_${Date.now()}.txt`;
      }

      const normalizedCreatorAddress = mintingAddress
        ? mintingAddress.toLowerCase()
        : "";

      const resolveTokenMetadata = async (
        tokenId: string,
        contentHash: string,
        index: number,
      ) => {
        if (metadataUploadCache.has(tokenId)) {
          return metadataUploadCache.get(tokenId)!.tokenURI;
        }

        const accessibleImageUrl =
          coverImageIpfsUrl ||
          (coverImageUrl && !coverImageUrl.startsWith("data:")
            ? coverImageUrl
            : placeholderImageUrl);

        const tokenEncryptionData = encryptionDataMap.get(tokenId);

        const metadataAttributes: Array<{ trait_type: string; value: string }> =
          [
            { trait_type: "Token ID", value: tokenId.toString() },
            { trait_type: "Batch Index", value: (index + 1).toString() },
            {
              trait_type: "Creator",
              value: normalizedCreatorAddress || mintingAddress || "",
            },
            { trait_type: "Contract", value: contractAddress },
            {
              trait_type: "Encrypted",
              value: tokenEncryptionData || isTextContent ? "Yes" : "No",
            },
          ];

        if (contentHash) {
          metadataAttributes.push({
            trait_type: "Content Hash",
            value: contentHash,
          });
        }

        metadataAttributes.push({
          trait_type: "Minted At",
          value: new Date().toISOString(),
        });

        const metadataPayload: Record<string, any> = {
          name:
            nftTitle || fileName
              ? `${(nftTitle || fileName).trim()}`
              : `SAU NFT`,
          description: nftDescription || `SAU 플랫폼에서 생성된 NFT`,
          image: accessibleImageUrl,
          external_url: accessibleImageUrl,
          attributes: metadataAttributes,
          properties: {
            contractAddress,
            tokenId,
            creator: normalizedCreatorAddress || mintingAddress || "",
            contentHash,
            encrypted: !!tokenEncryptionData || isTextContent,
            encryptionType: tokenEncryptionData?.encryptionType ?? null,
            // ciphertext 원문은 여기 넣지 않는다: 메타데이터 JSON에는 256KB
            // 캡이 있고, 이 값은 이미 Arweave(ciphertextUrl)에 업로드돼 있다.
            encryptionData: tokenEncryptionData
              ? {
                  encryptionType: tokenEncryptionData.encryptionType,
                  dataToEncryptHash: tokenEncryptionData.dataToEncryptHash,
                  accessControlConditions:
                    tokenEncryptionData.accessControlConditions,
                  fileMetadata: tokenEncryptionData.fileMetadata,
                  mimeType: tokenEncryptionData.mimeType,
                  encoding: tokenEncryptionData.encoding,
                  ciphertextUrl: sharedContentUrl,
                }
              : null,
          },
        };

        if (coverImageUrl && coverImageUrl.startsWith("data:")) {
          metadataPayload.image_data = coverImageUrl;
          metadataAttributes.push({
            trait_type: "Image Source",
            value: "embedded-base64",
          });
        }

        try {
          await assertMintingAccountUnchanged();
          const metadataAuth = await getSiweAuthFields("upload_nft_metadata");
          const metadataResponse = await fetch("/api/upload-nft-metadata", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              metadata: metadataPayload,
              fileName: `metadata-${contractAddress}-${tokenId}.json`,
              userAddress: metadataAuth.userAddress,
              siweMessage: metadataAuth.siweMessage,
              siweSignature: metadataAuth.siweSignature,
            }),
          });

          const metadataJson = await metadataResponse.json();

          if (metadataResponse.ok && metadataJson.success) {
            const preferredUri =
              metadataJson.ipfsUrl || metadataJson.metadataUrl;
            if (preferredUri) {
              metadataUploadCache.set(tokenId, {
                tokenURI: preferredUri,
                source: "pinata-metadata-api",
                ipfsHash: metadataJson.ipfsHash || null,
              });
              return preferredUri;
            }
          } else {
            console.warn(" 메타데이터 업로드 실패:", metadataJson);
          }
        } catch (error) {
          console.error(" 메타데이터 업로드 오류:", error);
        }

        throw new Error("메타데이터 업로드에 실패했습니다. 민팅을 중단합니다.");
      };

      // 1. Token ID 생성
      const preGeneratedTokenIds: string[] = [];
      const tokenId = generateTokenId(mintingAddress);
      preGeneratedTokenIds.push(tokenId);

      let sharedContentHash = "";
      let sharedContentUrl: string | null = null;
      const encryptionDataMap = new Map<string, any>(); // Token ID별 암호화 데이터

      // 2. 각 Token ID마다 개별 암호화 (올바른 접근 제어를 위해) — 반드시 아래
      // 3번(업로드)보다 먼저 실행한다. 원본 평문을 그대로 Arweave에 올리면
      // 암호화가 실패해도 이미 평문이 영구 공개된 뒤라 되돌릴 수 없다.
      console.log(" 콘텐츠 암호화 시작...");

      if (file && fileArrayBuffer) {
        console.log(" 파일 암호화 시작...");

        for (const tokenId of preGeneratedTokenIds) {
          try {
            console.groupCollapsed(`[Encryption] 파일 토큰 ${tokenId}`);
            const encryptionResult = await encryptFile(
              file,
              tokenId,
              contractAddress,
            );

            console.log(" Lit 암호화 결과", {
              dataToEncryptHash: encryptionResult.dataToEncryptHash,
              accessControl: encryptionResult.accessControlConditions,
            });
            encryptionDataMap.set(tokenId, {
              encryptionType: "lit-protocol",
              ciphertext: encryptionResult.ciphertext,
              dataToEncryptHash: encryptionResult.dataToEncryptHash,
              accessControlConditions: encryptionResult.accessControlConditions,
              fileMetadata: encryptionResult.fileMetadata,
              mimeType: encryptionResult.mimeType,
              encoding: encryptionResult.encoding,
            });

            console.log(` Token ID ${tokenId} 파일 암호화 완료`);
            console.groupEnd();
          } catch (encryptionError) {
            console.error(`Token ID ${tokenId} 암호화 실패:`, encryptionError);
            console.groupEnd();
            setResult({
              success: false,
              error: "콘텐츠 암호화에 실패했습니다. 민팅을 중단합니다.",
              message:
                encryptionError instanceof Error
                  ? encryptionError.message
                  : String(encryptionError),
            });
            setLoading(false);
            setMinting(false);
            return;
          }
        }
      } else if (content) {
        console.log(" 각 NFT별 텍스트 암호화 시작...");

        for (const tokenId of preGeneratedTokenIds) {
          try {
            console.groupCollapsed(`[Encryption] 텍스트 토큰 ${tokenId}`);
            // Web Crypto API 사용 (각 Token ID로)
            const encryptionResult = await processTextAsFile(
              content,
              fileName,
              mintingAddress,
              tokenId, // 실제 Token ID 사용!
              contractAddress,
            );

            console.log(" Lit 암호화 결과", {
              dataToEncryptHash: encryptionResult.dataToEncryptHash,
              accessControl: encryptionResult.accessControlConditions,
            });
            encryptionDataMap.set(tokenId, {
              encryptionType: "lit-protocol",
              ciphertext: encryptionResult.ciphertext,
              dataToEncryptHash: encryptionResult.dataToEncryptHash,
              accessControlConditions: encryptionResult.accessControlConditions,
              fileMetadata: encryptionResult.fileMetadata,
              mimeType: encryptionResult.mimeType,
              encoding: encryptionResult.encoding,
            });

            console.log(` Token ID ${tokenId} 암호화 완료`);
            console.groupEnd();
          } catch (encryptionError) {
            console.error(`Token ID ${tokenId} 암호화 실패:`, encryptionError);
            console.groupEnd();
            setResult({
              success: false,
              error: "콘텐츠 암호화에 실패했습니다. 민팅을 중단합니다.",
              message:
                encryptionError instanceof Error
                  ? encryptionError.message
                  : String(encryptionError),
            });
            setLoading(false);
            setMinting(false);
            return;
          }
        }
      }

      // 3. 암호문 업로드 (암호화 이후) — 메타데이터 JSON에는 256KB 캡이 있어
      // 암호문 전체를 인라인으로 넣을 수 없으므로, Blob을 거쳐 Arweave에 올린
      // 뒤 그 URL만 메타데이터에 포인터로 남긴다. 절대 원본 평문은 올리지 않는다.
      const primaryTokenId = preGeneratedTokenIds[0];
      const primaryEncryptionData = encryptionDataMap.get(primaryTokenId);

      if (primaryEncryptionData?.ciphertext) {
        try {
          console.groupCollapsed("[Arweave] 암호문 업로드 요청");
          console.log(" 업로드 정보", {
            fileName,
            ciphertextLength: primaryEncryptionData.ciphertext.length,
          });
          console.groupEnd();

          await assertMintingAccountUnchanged();

          // 큰 파일은 Vercel 함수의 4.5MB 요청 바디 한도에 걸리므로, 서버를
          // 거치지 않고 브라우저에서 Blob 스토리지로 직접 올린 뒤 그 URL만
          // 서버에 전달한다. /api/upload-content-blob이 SIWE 서명을 검증하고
          // 업로드 토큰을 내준다.
          const blobAuth = await getSiweAuthFields("upload_shared_content");
          const blob = await uploadToBlob(
            fileName,
            primaryEncryptionData.ciphertext,
            {
              access: "public",
              contentType: "text/plain",
              handleUploadUrl: "/api/upload-content-blob",
              clientPayload: JSON.stringify({
                siweMessage: blobAuth.siweMessage,
                siweSignature: blobAuth.siweSignature,
                userAddress: blobAuth.userAddress,
              }),
            },
          );

          const uploadResponse = await signedFetch("upload_shared_content", {
            blobUrl: blob.url,
            fileName,
            contentType: "text/plain",
          });

          const uploadResult = await uploadResponse.json();
          console.groupCollapsed("[Arweave] 업로드 응답");
          console.log(" 업로드 결과", uploadResult);
          console.groupEnd();

          if (uploadResult.success) {
            sharedContentHash = uploadResult.contentId;
            sharedContentUrl = uploadResult.contentUrl || null;
            console.log(" 암호문 업로드 완료:", uploadResult.contentUrl);
          } else {
            throw new Error(
              `콘텐츠 업로드 실패: ${uploadResult.error ?? "unknown"}`,
            );
          }
        } catch (error) {
          console.error("암호문 업로드 오류:", error);
          setResult({
            success: false,
            error: "콘텐츠 업로드에 실패했습니다. 민팅을 중단합니다.",
          });
          setLoading(false);
          setMinting(false);
          return;
        }
      }

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      console.log(" NFT 민팅 시작 (단일 모드)");

      try {
        const tokenId = preGeneratedTokenIds[0];
        const contentHash = sharedContentHash;
        const tokenEncryptionData = encryptionDataMap.get(tokenId);
        const resolvedTokenURI = await resolveTokenMetadata(
          tokenId,
          contentHash,
          0,
        );

        // 다중 발행은 지원하지 않는다 ([6-4]) — 토큰당 항상 1개만 발행한다.
        await assertMintingAccountUnchanged();
        const estimatedGas = await contract.mintOwn.estimateGas(
          tokenId,
          1,
          contentHash,
          resolvedTokenURI,
        );
        const tx = await contract.mintOwn(
          tokenId,
          1,
          contentHash,
          resolvedTokenURI,
          { gasLimit: (estimatedGas * 120n) / 100n },
        );

        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
          throw new Error("NFT 민팅 트랜잭션이 실패했습니다.");
        }

        const mintedBalance = await contract.balanceOf(
          mintingAddress,
          tokenId,
        );
        const mintedBalanceBigInt =
          typeof mintedBalance === "bigint"
            ? mintedBalance
            : BigInt(mintedBalance?.toString?.() ?? "0");
        if (mintedBalanceBigInt === 0n) {
          throw new Error(
            "NFT 민팅 이후 잔액이 0입니다. 민팅이 완료되지 않았습니다.",
          );
        }

        const metadataInfo = metadataUploadCache.get(tokenId);
        const finalTokenURI = metadataInfo?.tokenURI || resolvedTokenURI;

        console.groupCollapsed("[Mint] 성공");
        console.log(" 민팅 정보", {
          tokenId,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          tokenURI: finalTokenURI,
          encryptionType: tokenEncryptionData?.encryptionType || "unknown",
          metadataSource: metadataInfo?.source,
        });
        console.groupEnd();

        results.push({
          nftNumber: 1,
          tokenId,
          contentHash,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          success: true,
          encryptionData: tokenEncryptionData,
          isTextContent,
          fileName,
          tokenURI: finalTokenURI,
          metadataSource: metadataInfo?.source ?? null,
          metadataIpfsHash: metadataInfo?.ipfsHash || null,
        });

        successCount = 1;
      } catch (error: any) {
        console.error("NFT 민팅 실패:", error);
        console.groupCollapsed("[Mint] 실패");
        console.error(" 민팅 에러 상세", error);
        console.groupEnd();

        results.push({
          nftNumber: 1,
          success: false,
          error: error.message || "알 수 없는 오류",
        });

        failureCount = 1;
      }

      const hasEncryptionData = encryptionDataMap.size > 0;

      // Lit이 종료·리셋되면 암호문은 영구히 복호화 불가능해진다. 그런데 복구 수단은
      // 이미 존재한다 — 창작자 디스크에 있는 원본 파일이다. 별도의 백업 암호화를 새로
      // 만들 필요 없이, "원본을 보관해야 한다"는 사실과 재발행에 필요한 식별 정보만
      // 남기면 전손을 막을 수 있다.
      const primary = results[0];
      const primaryEncryption = primary?.tokenId
        ? encryptionDataMap.get(primary.tokenId)
        : undefined;
      const recoveryInfo = primary?.success
        ? {
            _readme:
              "이 NFT의 콘텐츠 키는 Lit Protocol 네트워크가 보관합니다. Lit이 종료되거나 네트워크가 리셋되면 아래 암호문은 영구히 복호화할 수 없습니다. 원본 파일을 반드시 별도로 보관하세요 — 그것이 유일한 복구 수단입니다.",
            tokenId: primary.tokenId,
            contractAddress,
            chainId: walletState.chainId,
            litNetwork: process.env.NEXT_PUBLIC_LIT_NETWORK ?? null,
            litChain: process.env.NEXT_PUBLIC_LIT_CHAIN ?? null,
            minHoldingSeconds: MIN_HOLDING_SECONDS,
            tokenURI: primary.tokenURI,
            ciphertextUrl: sharedContentUrl,
            contentHash: primary.contentHash,
            dataToEncryptHash: primaryEncryption?.dataToEncryptHash ?? null,
            fileName,
            mimeType: primaryEncryption?.mimeType ?? null,
            encoding: primaryEncryption?.encoding ?? null,
            transactionHash: primary.transactionHash,
            mintedAt: new Date().toISOString(),
          }
        : null;

      setResult({
        recoveryInfo,
        success: successCount > 0,
        totalRequested: 1,
        successCount: successCount,
        failureCount: failureCount,
        results: results,
        coverImage:
          coverImageUrl || coverImageIpfsUrl
            ? {
                url: coverImageUrl || null,
                ipfsUrl: coverImageIpfsUrl || null,
                name: coverImage?.name || null,
                type: coverImage?.type || null,
              }
            : null,
        message:
          successCount > 0
            ? "NFT가 성공적으로 생성되었습니다!"
            : `NFT 생성에 실패했습니다: ${results[0]?.error ?? "알 수 없는 오류"}`,
        hasEncryption: hasEncryptionData || isTextContent,
      });

      setPaymentStep("estimate");
    } catch (error: any) {
      console.error("NFT 민팅 실패:", error);

      let errorMessage = "알 수 없는 오류가 발생했습니다.";

      if (error.message) {
        errorMessage = error.message;
      } else if (error.reason) {
        errorMessage = error.reason;
      } else if (error.code) {
        errorMessage = `오류 코드: ${error.code}`;
      }

      setResult({
        success: false,
        error: errorMessage,
        message: "NFT 생성에 실패했습니다.",
      });

      setPaymentStep("payment");
    } finally {
      setLoading(false);
      setMinting(false);
    }
  };

  // 비용 계산 함수
  const calculateCost = async (contentSize: number) => {
    try {
      const gasResponse = await signedFetch("calculate_cost", {
        nftCount: 1,
        contentSize,
      });

      const gasData = await gasResponse.json();
      setCostEstimate(gasData);
      setShowCostBreakdown(true);
    } catch (error) {
      console.error("Cost calculation error:", error);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        width: "100%",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* 네비게이션 */}
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "32px",
            padding: "16px 0",
            borderBottom: "1px solid #e5e7eb",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link
              href="/"
              style={{
                fontSize: "clamp(18px, 4vw, 24px)",
                fontWeight: "bold",
                color: "#1f2937",
                textDecoration: "none",
              }}
            >
              SAU 플랫폼
            </Link>
            <span
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                backgroundColor: "#dbeafe",
                color: "#1e40af",
                borderRadius: "12px",
                fontWeight: "600",
              }}
            >
              Sepolia
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: "clamp(12px, 3vw, 16px)",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/create"
              style={{
                color: "#3b82f6",
                textDecoration: "none",
                fontWeight: "500",
                fontSize: "clamp(14px, 3vw, 16px)",
              }}
            >
              NFT 생성
            </Link>
            <Link
              href="/access"
              style={{
                color: "#6b7280",
                textDecoration: "none",
                fontWeight: "500",
                fontSize: "clamp(14px, 3vw, 16px)",
              }}
            >
              데이터 접근
            </Link>
          </div>
        </nav>

        <h1
          style={{
            textAlign: "center",
            color: "#1f2937",
            marginBottom: "32px",
            fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
            lineHeight: "1.3",
            padding: "0 16px",
          }}
        >
          NFT 생성 및 자동 접근 제어 설정
        </h1>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "clamp(16px, 4vw, 24px)",
            marginBottom: "20px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <p
            style={{ color: "#6b7280", marginBottom: "20px", fontSize: "14px" }}
          >
            NFT를 생성하면 콘텐츠가 자동으로 암호화되고, NFT 소유자만 접근할 수
            있습니다.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              mintNFT(formData);
            }}
          >
            {/* MetaMask 연결 상태 */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                지갑 연결:
              </label>
              {!walletState.isConnected ? (
                <button
                  type="button"
                  onClick={connectWallet}
                  disabled={loading}
                  style={{
                    backgroundColor: loading ? "#9ca3af" : "#f59e0b",
                    color: "white",
                    padding: "12px 24px",
                    border: "none",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {loading ? "연결 중..." : " MetaMask 연결"}
                </button>
              ) : (
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "#dcfce7",
                    border: "1px solid #22c55e",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "500",
                      color: "#166534",
                      marginBottom: "4px",
                      fontSize: "clamp(0.875rem, 2.5vw, 1rem)",
                    }}
                  >
                    MetaMask 연결됨
                  </div>
                  <div
                    style={{
                      color: "#15803d",
                      fontFamily: "monospace",
                      fontSize: "clamp(0.7rem, 2vw, 0.75rem)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {walletState.address.slice(0, 10)}...
                    {walletState.address.slice(-8)}
                  </div>
                  <div
                    style={{
                      color: "#15803d",
                      fontSize: "clamp(0.7rem, 2vw, 0.75rem)",
                      marginTop: "4px",
                    }}
                  >
                    잔액: {parseFloat(walletState.balance).toFixed(4)} ETH
                  </div>
                </div>
              )}
            </div>

            {/* 커버 이미지 업로드 섹션 */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                NFT 커버 이미지 (선택사항):
              </label>
              <div
                style={{
                  border: "2px dashed #d1d5db",
                  borderRadius: "8px",
                  padding: "20px",
                  textAlign: "center",
                  backgroundColor: "#f9fafb",
                }}
              >
                <input
                  type="file"
                  id="cover-image-upload"
                  ref={coverImageInputRef}
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImageUpload}
                />
                {imageLoading ? (
                  <div style={{ padding: "20px" }}>
                    <div
                      style={{
                        display: "inline-block",
                        width: "40px",
                        height: "40px",
                        border: "4px solid #e5e7eb",
                        borderTop: "4px solid #3b82f6",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    <p
                      style={{
                        margin: "10px 0 0 0",
                        fontSize: "14px",
                        color: "#6b7280",
                      }}
                    >
                      이미지 처리 중...
                    </p>
                    <style
                      dangerouslySetInnerHTML={{
                        __html: `
    @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
    }
    `,
                      }}
                    />
                  </div>
                ) : coverImagePreview ? (
                  <div>
                    <img
                      src={coverImagePreview}
                      alt="커버 이미지 미리보기"
                      style={{
                        maxWidth: "200px",
                        maxHeight: "200px",
                        borderRadius: "8px",
                        marginBottom: "10px",
                      }}
                    />
                    <div>
                      <p
                        style={{
                          margin: "0 0 10px 0",
                          fontSize: "14px",
                          color: "#374151",
                        }}
                      >
                        {coverImage?.name} (
                        {((coverImage?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                      </p>
                      <button
                        type="button"
                        onClick={handleImageRemove}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        이미지 제거
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        coverImageInputRef.current?.click();
                      }}
                      disabled={imageLoading}
                      style={{
                        display: "inline-block",
                        padding: "12px 24px",
                        backgroundColor: imageLoading ? "#9ca3af" : "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: imageLoading ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        transition: "background-color 0.2s",
                      }}
                    >
                      이미지 선택
                    </button>
                    <p
                      style={{
                        margin: "8px 0 0 0",
                        fontSize: "12px",
                        color: "#6b7280",
                      }}
                    >
                      JPG, PNG, GIF, WebP 형식 (최대 4MB)
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                NFT 제목:
              </label>
              <input
                type="text"
                name="title"
                placeholder="NFT 제목을 작성해 주십시오"
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                NFT 설명:
              </label>
              <textarea
                name="description"
                placeholder="NFT에 대한 설명을 작성하여주십시오"
                style={{
                  width: "100%",
                  height: "80px",
                  padding: "8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                파일 선택:
              </label>
              <input
                type="file"
                name="file"
                accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.mp4,.mp3"
                disabled={inputMode === "text"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setInputMode("file");
                    calculateCost(file.size);
                    // 텍스트 입력 초기화
                    const textArea = document.querySelector(
                      'textarea[name="text"]',
                    ) as HTMLTextAreaElement;
                    if (textArea) {
                      textArea.value = "";
                    }
                  } else {
                    setInputMode(null);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor: inputMode === "text" ? "#f3f4f6" : "white",
                  cursor: inputMode === "text" ? "not-allowed" : "pointer",
                  opacity: inputMode === "text" ? 0.6 : 1,
                }}
              />
              <p
                style={{
                  margin: "4px 0 0 0",
                  fontSize: "12px",
                  color: inputMode === "text" ? "#9ca3af" : "#6b7280",
                }}
              >
                {inputMode === "text"
                  ? "텍스트를 입력 중이므로 파일 선택이 비활성화되었습니다."
                  : "파일을 선택하면 텍스트 입력이 비활성화됩니다. 텍스트, 이미지, 문서 등 다양한 형식을 지원합니다."}
              </p>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                텍스트 콘텐츠:
              </label>
              <textarea
                name="text"
                placeholder="파일을 업로드하거나 텍스트를 작성하여 넣어주십시오"
                disabled={inputMode === "file"}
                onChange={(e) => {
                  const textContent = e.target.value;
                  if (textContent.trim()) {
                    setInputMode("text");
                    // 파일 입력 초기화
                    const fileInput = document.querySelector(
                      'input[name="file"]',
                    ) as HTMLInputElement;
                    if (fileInput) {
                      fileInput.value = "";
                    }
                  } else {
                    setInputMode(null);
                  }
                  const file = (
                    document.querySelector(
                      'input[name="file"]',
                    ) as HTMLInputElement
                  )?.files?.[0];
                  const contentSize = file ? file.size : textContent.length;
                  calculateCost(contentSize);
                }}
                style={{
                  width: "100%",
                  height: "100px",
                  padding: "8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  resize: "vertical",
                  backgroundColor: inputMode === "file" ? "#f3f4f6" : "white",
                  cursor: inputMode === "file" ? "not-allowed" : "text",
                  opacity: inputMode === "file" ? 0.6 : 1,
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "4px",
                }}
              >
                <p
                  style={{
                    margin: "0",
                    fontSize: "12px",
                    color: inputMode === "file" ? "#9ca3af" : "#6b7280",
                  }}
                >
                  {inputMode === "file"
                    ? "파일을 선택했으므로 텍스트 입력이 비활성화되었습니다."
                    : "텍스트를 입력하면 파일 선택이 비활성화됩니다."}
                </p>
                {inputMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode(null);
                      // 파일 입력 초기화
                      const fileInput = document.querySelector(
                        'input[name="file"]',
                      ) as HTMLInputElement;
                      if (fileInput) {
                        fileInput.value = "";
                      }
                      // 텍스트 입력 초기화
                      const textArea = document.querySelector(
                        'textarea[name="text"]',
                      ) as HTMLTextAreaElement;
                      if (textArea) {
                        textArea.value = "";
                      }
                      calculateCost(0);
                    }}
                    style={{
                      padding: "4px 8px",
                      fontSize: "11px",
                      backgroundColor: "#f3f4f6",
                      color: "#6b7280",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = "#e5e7eb";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                    }}
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {/* 비용 계산 섹션 */}
            {showCostBreakdown && costEstimate && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "16px",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "16px",
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  발행 비용 상세 (발행자 부담)
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      padding: "8px",
                      backgroundColor: "white",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginBottom: "2px",
                      }}
                    >
                      이더리움 가스비
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#374151",
                      }}
                    >
                      {costEstimate.ethereumGas} ETH
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !walletState.isConnected}
              style={{
                backgroundColor: !walletState.isConnected
                  ? "#9ca3af"
                  : paymentStep === "processing"
                    ? "#10b981"
                    : "#3b82f6",
                color: "white",
                padding: "12px 24px",
                border: "none",
                borderRadius: "6px",
                cursor:
                  loading || !walletState.isConnected
                    ? "not-allowed"
                    : "pointer",
                opacity: loading || !walletState.isConnected ? 0.6 : 1,
                fontSize: "16px",
                fontWeight: "500",
              }}
            >
              {!walletState.isConnected
                ? "MetaMask 연결 필요"
                : paymentStep === "processing"
                  ? " NFT 생성 중..."
                  : " NFT 생성하기"}
            </button>
          </form>

          {result && (
            <div
              style={{
                marginTop: "20px",
                padding: "16px",
                backgroundColor: result.success ? "#f0f9ff" : "#fef2f2",
                border: `1px solid ${result.success ? "#0ea5e9" : "#f87171"}`,
                borderRadius: "8px",
              }}
            >
              <h3
                style={{
                  margin: "0 0 12px 0",
                  color: result.success ? "#0c4a6e" : "#991b1b",
                  fontSize: "18px",
                }}
              >
                {result.success ? " NFT 생성 완료!" : " NFT 생성 실패"}
              </h3>

              {/* 생성 결과 요약 */}
              {result.totalRequested && (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "12px",
                    backgroundColor: result.success ? "#dcfce7" : "#fef3c7",
                    border: `1px solid ${result.success ? "#22c55e" : "#f59e0b"}`,
                    borderRadius: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(120px, 1fr))",
                      gap: "12px",
                      textAlign: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginBottom: "2px",
                        }}
                      >
                        요청된 NFT
                      </div>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        {result.totalRequested}개
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginBottom: "2px",
                        }}
                      >
                        성공한 NFT
                      </div>
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: "600",
                          color: "#22c55e",
                        }}
                      >
                        {result.successCount}개
                      </div>
                    </div>
                    {result.failureCount > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginBottom: "2px",
                          }}
                        >
                          실패한 NFT
                        </div>
                        <div
                          style={{
                            fontSize: "16px",
                            fontWeight: "600",
                            color: "#ef4444",
                          }}
                        >
                          {result.failureCount}개
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p
                style={{
                  margin: "0 0 24px 0",
                  fontSize: "18px",
                  fontWeight: "600",
                  color: result.success ? "#0c4a6e" : "#991b1b",
                  textAlign: "center",
                }}
              >
                {result.message}
              </p>

              {result.recoveryInfo && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    backgroundColor: "#fffbeb",
                    borderRadius: "6px",
                    border: "1px solid #f59e0b",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 8px 0",
                      fontWeight: 600,
                      color: "#92400e",
                    }}
                  >
                    ⚠️ 원본 파일을 반드시 보관하세요
                  </p>
                  <p
                    style={{
                      margin: "0 0 12px 0",
                      fontSize: "14px",
                      color: "#92400e",
                      lineHeight: 1.6,
                    }}
                  >
                    콘텐츠를 복호화하는 키는 Lit Protocol 네트워크가 보관합니다.
                    Lit이 종료되거나 네트워크가 리셋되면 이 NFT의 콘텐츠는{" "}
                    <strong>영구히 복호화할 수 없습니다.</strong> 방금 업로드한
                    원본 파일이 유일한 복구 수단입니다.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(
                        new Blob(
                          [JSON.stringify(result.recoveryInfo, null, 2)],
                          { type: "application/json" },
                        ),
                        `sau-recovery-${result.recoveryInfo.tokenId}.json`,
                      )
                    }
                    style={{
                      padding: "10px 16px",
                      minHeight: "44px",
                      backgroundColor: "#b45309",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    복구 정보 내려받기 (JSON)
                  </button>
                </div>
              )}

              {result.success && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    backgroundColor: "#e0f2fe",
                    borderRadius: "6px",
                    border: "1px solid #0891b2",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 8px 0",
                      fontWeight: "500",
                      color: "#0c4a6e",
                    }}
                  >
                    다음 단계:
                  </p>
                  <p
                    style={{ margin: "0", fontSize: "14px", color: "#0369a1" }}
                  >
                    <Link
                      href="/access"
                      style={{ color: "#0369a1", textDecoration: "underline" }}
                    >
                      데이터 접근 페이지
                    </Link>
                    에서 NFT 소유권을 확인하여 암호화된 데이터에 접근해보세요!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

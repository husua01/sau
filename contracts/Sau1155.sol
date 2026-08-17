// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { ERC1155Supply } from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Sau1155
 * @notice SAU 플랫폼용 ERC-1155 컨트랙트
 * - NFT 소유권 기반 콘텐츠 접근 제어
 * - Lit Protocol과 연동하여 암호화된 콘텐츠 관리
 * - 다중 민팅 및 배치 처리 지원
 */
contract Sau1155 is ERC1155Supply, AccessControl {
    string public constant name = "SAU Content Access Token";
    string public constant symbol = "SAU";

    // 역할 정의
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // 이벤트 정의
    event ContentCreated(uint256 indexed tokenId, address indexed creator, string contentHash);
    event AccessGranted(address indexed user, uint256 indexed tokenId);

    // 토큰 메타데이터 저장
    mapping(uint256 => string) public tokenContentHashes;
    mapping(uint256 => address) public tokenCreators;
    mapping(uint256 => uint256) public tokenCreationTime;
    mapping(uint256 => string) public tokenURIs; // 개별 토큰 URI 저장
    mapping(uint256 => bool) private _tokenExists;

    constructor(string memory baseUri, address initialOwner)
        ERC1155(baseUri)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);
    }

    // base URI 갱신 (관리자 전용)
    function setBaseURI(string calldata newBase) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newBase);
    }

    // 개별 토큰 URI 오버라이드 (MetaMask NFT 표시용)
    // 개별 URI가 없으면 ERC-1155 표준 {id} 치환 규약을 따르는 base URI를 그대로 반환한다.
    function uri(uint256 tokenId) public view override returns (string memory) {
        if (bytes(tokenURIs[tokenId]).length > 0) {
            return tokenURIs[tokenId];
        }
        return super.uri(tokenId);
    }

    // 개별 토큰 URI 설정 — 창작자만, 1회 한정
    function setTokenURI(uint256 tokenId, string calldata newUri) external {
        require(tokenCreators[tokenId] == msg.sender, "Not creator");
        require(bytes(tokenURIs[tokenId]).length == 0, "URI already set");
        tokenURIs[tokenId] = newUri;
        emit URI(newUri, tokenId);
    }

    // 내부: 토큰 민팅 이후 메타데이터 설정 (동일 tokenId 재사용 차단)
    function _storeTokenMetadata(
        uint256 tokenId,
        address creator,
        string calldata contentHash,
        string memory tokenURIValue
    ) internal {
        require(!_tokenExists[tokenId], "Token ID already used");
        _tokenExists[tokenId] = true;
        tokenContentHashes[tokenId] = contentHash;
        tokenCreators[tokenId] = creator;
        tokenCreationTime[tokenId] = block.timestamp;
        if (bytes(tokenURIValue).length > 0) {
            tokenURIs[tokenId] = tokenURIValue;
        }
    }

    // 단일 토큰 민팅
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        string calldata contentHash
    ) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, "");

        _storeTokenMetadata(id, to, contentHash, "");

        emit ContentCreated(id, to, contentHash);
        emit AccessGranted(to, id);
    }

    // 단일 토큰 민팅 (메타데이터 포함, 단일 트랜잭션)
    function mintWithMetadata(
        address to,
        uint256 id,
        uint256 amount,
        string calldata contentHash,
        string calldata tokenURIValue
    ) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, "");

        _storeTokenMetadata(id, to, contentHash, tokenURIValue);

        emit ContentCreated(id, to, contentHash);
        emit AccessGranted(to, id);
    }

    // 본인 지갑으로 직접 민팅 (일반 사용자용 — MINTER_ROLE 불필요)
    // amount는 항상 1로 고정한다: 콘텐츠 접근권 토큰은 1-of-1이 전제이며,
    // 누구나 호출 가능한 함수이므로 임의 수량을 허용하면 무상 대량 발행이 가능해진다.
    function mintOwn(
        uint256 id,
        uint256 amount,
        string calldata contentHash,
        string calldata tokenURIValue
    ) external {
        require(amount == 1, "mintOwn: amount must be 1");
        _mint(msg.sender, id, amount, "");
        _storeTokenMetadata(id, msg.sender, contentHash, tokenURIValue);
        emit ContentCreated(id, msg.sender, contentHash);
        emit AccessGranted(msg.sender, id);
    }

    // 배치 토큰 민팅
    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        string[] calldata contentHashes
    ) external onlyRole(MINTER_ROLE) {
        require(ids.length == contentHashes.length, "IDs and hashes length mismatch");

        _mintBatch(to, ids, amounts, "");

        // 메타데이터 저장 (모든 토큰 ID에 대해 이벤트 발생)
        for (uint256 i = 0; i < ids.length; i++) {
            _storeTokenMetadata(ids[i], to, contentHashes[i], "");

            emit ContentCreated(ids[i], to, contentHashes[i]);
            emit AccessGranted(to, ids[i]);
        }
    }

    // 배치 토큰 민팅 (메타데이터 포함, 단일 트랜잭션)
    function mintBatchWithMetadata(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        string[] calldata contentHashes,
        string[] calldata tokenURIValues
    ) external onlyRole(MINTER_ROLE) {
        require(ids.length == contentHashes.length, "IDs and hashes length mismatch");
        require(ids.length == tokenURIValues.length, "IDs and URIs length mismatch");

        _mintBatch(to, ids, amounts, "");

        for (uint256 i = 0; i < ids.length; i++) {
            _storeTokenMetadata(ids[i], to, contentHashes[i], tokenURIValues[i]);
            emit ContentCreated(ids[i], to, contentHashes[i]);
            emit AccessGranted(to, ids[i]);
        }
    }

    // 토큰 소각
    function burn(address from, uint256 id, uint256 amount) external {
        require(
            from == _msgSender() || isApprovedForAll(from, _msgSender()),
            "ERC1155: caller is not token owner or approved"
        );
        _burn(from, id, amount);

        // 남은 유통량이 없으면 콘텐츠 메타데이터 정리 (tokenId 재사용 방지 플래그는 유지)
        if (totalSupply(id) == 0) {
            delete tokenContentHashes[id];
            delete tokenCreators[id];
            delete tokenCreationTime[id];
            delete tokenURIs[id];
        }
    }

    // 토큰 정보 조회
    function getTokenInfo(uint256 tokenId) external view returns (
        string memory contentHash,
        address creator,
        uint256 creationTime
    ) {
        return (
            tokenContentHashes[tokenId],
            tokenCreators[tokenId],
            tokenCreationTime[tokenId]
        );
    }

    // 접근 권한 확인
    function hasAccess(address user, uint256 tokenId) external view returns (bool) {
        return balanceOf(user, tokenId) > 0;
    }

    // supportsInterface 함수 오버라이드 (ERC1155와 AccessControl 충돌 해결)
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

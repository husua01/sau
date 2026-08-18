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

    // tokenId => 보유자 => 그 보유자가 잔액 0에서 처음 토큰을 받은 시각.
    // 잔액이 0이 되면 삭제해, 다시 받으면 시계가 새로 시작하도록 한다.
    mapping(uint256 => mapping(address => uint256)) public holdingSince;

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

    // tokenId 하위 96비트만 자유롭게 쓸 수 있고, 상위 160비트는 항상 호출자 주소여야 한다.
    function tokenIdPrefixOf(address account) public pure returns (uint256) {
        return uint256(uint160(account));
    }

    // 본인 지갑으로 직접 민팅 (일반 사용자용 — MINTER_ROLE 불필요)
    // amount는 항상 1로 고정한다: 콘텐츠 접근권 토큰은 1-of-1이 전제이며,
    // 누구나 호출 가능한 함수이므로 임의 수량을 허용하면 무상 대량 발행이 가능해진다.
    //
    // tokenId는 호출자 주소를 상위 160비트에 담아야 한다. 이 앱은 민팅 '전에' 콘텐츠를
    // 그 tokenId로 암호화해 Arweave에 올리므로, mintOwn 트랜잭션이 멤풀에 뜨는 순간
    // tokenId와 암호문 위치(tokenURI)가 함께 공개된다. id에 아무 제약이 없으면 공격자가
    // 같은 id로 앞질러 민팅해(front-running) 그 토큰의 소유자가 되고, 피해자의 트랜잭션은
    // "Token ID already used"로 리버트된다. Lit 접근 조건은 balanceOf(id) > 0 하나뿐이라
    // 그 상태로 공격자가 피해자의 콘텐츠를 그대로 복호화할 수 있다. 남의 주소로 시작하는
    // id는 아예 민팅할 수 없게 막아 이 경로를 닫는다 (하위 96비트 무작위면 충돌은 무시 가능).
    function mintOwn(
        uint256 id,
        uint256 amount,
        string calldata contentHash,
        string calldata tokenURIValue
    ) external {
        require(amount == 1, "mintOwn: amount must be 1");
        require(id >> 96 == tokenIdPrefixOf(msg.sender), "mintOwn: id must be prefixed with caller");
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

    // 접근 권한 확인 (잔액만 봄 — 대여 방어가 필요하면 hasHeldFor를 쓸 것)
    function hasAccess(address user, uint256 tokenId) external view returns (bool) {
        return balanceOf(user, tokenId) > 0;
    }

    // 보유 기간 기록. 잔액 0 → 보유로 바뀌는 순간에만 시각을 찍고, 보유 → 0이 되면 지운다.
    // 지우지 않으면 "빌렸다 반납"을 반복한 주소가 옛 기록으로 즉시 통과하게 된다.
    // 이미 보유 중인 주소가 추가 수량을 받을 때는 시계를 되돌리지 않는다(정상 보유자 불이익 방지).
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        if (to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (balanceOf(to, ids[i]) == 0) {
                    holdingSince[ids[i]][to] = block.timestamp;
                }
            }
        }

        super._update(from, to, ids, values);

        if (from != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (balanceOf(from, ids[i]) == 0) {
                    delete holdingSince[ids[i]][from];
                }
            }
        }
    }

    // Lit Protocol의 evmContractConditions가 호출하는 접근 판정 함수.
    //
    // balanceOf > 0만 보면 "NFT를 몇 분 빌려 복호화하고 반납"하는 경로가 그대로 열린다.
    // 최소 보유 기간을 요구하면 대여자가 그 시간만큼 실제 커스터디 위험을 떠안아야 하므로
    // 짧은 대여가 무의미해진다. (긴 대여까지 막지는 못한다 — 완화지 제거가 아니다.)
    //
    // 창작자는 대기 없이 통과시킨다: 원본 평문을 이미 갖고 있어 유출 위험이 없는데
    // 자기 콘텐츠를 확인하려고 기다리게 하는 건 UX 손해만 크다.
    function hasHeldFor(
        address account,
        uint256 tokenId,
        uint256 minHoldSeconds
    ) external view returns (bool) {
        if (balanceOf(account, tokenId) == 0) {
            return false;
        }
        if (tokenCreators[tokenId] == account) {
            return true;
        }
        uint256 since = holdingSince[tokenId][account];
        return since != 0 && block.timestamp >= since + minHoldSeconds;
    }

    // supportsInterface 함수 오버라이드 (ERC1155와 AccessControl 충돌 해결)
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

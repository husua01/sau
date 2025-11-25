// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Sau1155
 * @notice SAU 플랫폼용 ERC-1155 컨트랙트
 * - NFT 소유권 기반 콘텐츠 접근 제어
 * - Lit Protocol과 연동하여 암호화된 콘텐츠 관리
 * - 다중 민팅 및 배치 처리 지원
 */
contract Sau1155 is ERC1155, Ownable, AccessControl {
    string public name = "SAU Content Access Token";
    string public symbol = "SAU";
    
    // 역할 정의
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // 이벤트 정의
    event ContentCreated(uint256 indexed tokenId, address indexed creator, string contentHash);
    event AccessGranted(address indexed user, uint256 indexed tokenId);
    
    // 토큰 메타데이터 저장
    mapping(uint256 => string) public tokenContentHashes;
    mapping(uint256 => address) public tokenCreators;
    mapping(uint256 => uint256) public tokenCreationTime;
    mapping(uint256 => string) public tokenURIs; // ⚡ 개별 토큰 URI 저장
    
    string private _baseURI;
    
    constructor(string memory baseUri, address initialOwner) 
        ERC1155(baseUri) 
        Ownable(initialOwner) 
    {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);
        _baseURI = baseUri;
    }

    // URI 설정
    function setBaseURI(string calldata newBase) external onlyOwner {
        _setURI(newBase);
        _baseURI = newBase;
    }
    
    // ⚡ 개별 토큰 URI 오버라이드 (MetaMask NFT 표시용)
    function uri(uint256 tokenId) public view override returns (string memory) {
        // 개별 URI가 설정되어 있으면 반환
        if (bytes(tokenURIs[tokenId]).length > 0) {
            return tokenURIs[tokenId];
        }
        
        // 없으면 baseURI + tokenId 반환
        return string(abi.encodePacked(_baseURI, _toString(tokenId), ".json"));
    }
    
    // ⚡ 개별 토큰 URI 설정 함수 (임시로 누구나 호출 가능)
    function setTokenURI(uint256 tokenId, string calldata tokenURI) external {
        // 토큰 소유자만 URI 설정 가능하도록 제한
        require(balanceOf(msg.sender, tokenId) > 0, "Only token owner can set URI");
        tokenURIs[tokenId] = tokenURI;
    }
    
    // uint256을 string으로 변환하는 헬퍼 함수
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    // 내부: 토큰 민팅 이후 메타데이터 설정
    function _storeTokenMetadata(
        uint256 tokenId,
        address creator,
        string calldata contentHash,
        string memory tokenURIValue
    ) internal {
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

    // 배치 토큰 민팅
    function mintBatch(
        address to, 
        uint256[] calldata ids, 
        uint256[] calldata amounts,
        string[] calldata contentHashes
    ) external onlyRole(MINTER_ROLE) {
        require(ids.length == contentHashes.length, "IDs and hashes length mismatch");
        
        _mintBatch(to, ids, amounts, "");
        
        // 메타데이터 저장
        for (uint256 i = 0; i < ids.length; i++) {
            _storeTokenMetadata(ids[i], to, contentHashes[i], "");
            
            emit ContentCreated(ids[i], to, contentHashes[i]);
        }
        
        emit AccessGranted(to, ids[0]); // 첫 번째 토큰 ID로 이벤트 발생
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
        }

        emit AccessGranted(to, ids[0]);
    }

    // 토큰 소각
    function burn(address from, uint256 id, uint256 amount) external {
        require(
            from == _msgSender() || isApprovedForAll(from, _msgSender()),
            "ERC1155: caller is not token owner or approved"
        );
        _burn(from, id, amount);
    }

    // MINTER_ROLE 부여
    function grantMinterRole(address account) external onlyOwner {
        grantRole(MINTER_ROLE, account);
    }

    // MINTER_ROLE 철회
    function revokeMinterRole(address account) external onlyOwner {
        revokeRole(MINTER_ROLE, account);
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

    // 이더 수신을 위한 receive 함수
    receive() external payable {
        // 이더를 받을 수 있도록 함
    }
}



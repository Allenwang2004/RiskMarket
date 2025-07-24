// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Trading is Ownable {
    using SafeERC20 for IERC20;

    // Events
    event DirectTradeExecuted(
        bytes32 indexed conditionId,
        address indexed buyer,
        address indexed seller,
        uint256 outcome,
        uint256 amount,
        uint256 price
    );

    // 授權的調用者（CTFExchange）
    mapping(address => bool) public authorizedCallers;

    constructor() Ownable(msg.sender) {}

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "Unauthorized caller");
        _;
    }

    // 授權調用者
    function authorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
    }

    function revokeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
    }

    // 執行直接交易
    function executeDirectTrade(
        bytes32 conditionId,
        address buyer,
        address seller,
        uint256 outcome,
        uint256 amount,
        uint256 price,
        address collateralToken
    ) external onlyAuthorized {
        require(conditionalTokensAddress != address(0), "ConditionalTokens not set");
        
        // 計算位置 ID
        uint256 positionId = uint256(keccak256(abi.encode(conditionId, outcome)));
        
        IERC1155 conditionalTokens = IERC1155(conditionalTokensAddress);
        IERC20 collateral = IERC20(collateralToken);

        // 檢查賣家是否有足夠的 position token
        require(
            conditionalTokens.balanceOf(seller, positionId) >= amount,
            "Insufficient position tokens"
        );

        // 從買家轉移 USDC 到賣家
        collateral.safeTransferFrom(buyer, seller, price);

        // 從賣家轉移 position token 到買家
        conditionalTokens.safeTransferFrom(
            seller,
            buyer,
            positionId,
            amount,
            ""
        );

        emit DirectTradeExecuted(
            conditionId,
            buyer,
            seller,
            outcome,
            amount,
            price
        );
    }

    // 設置 ConditionalTokens 合約地址
    address public conditionalTokensAddress;

    function setConditionalTokensAddress(address _conditionalTokens) external onlyOwner {
        conditionalTokensAddress = _conditionalTokens;
    }
}

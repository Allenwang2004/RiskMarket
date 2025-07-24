// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ConditionalTokens.sol";
import "./Trading.sol";

contract CTFExchange is Ownable, ReentrancyGuard {
    // 市場結構
    struct Market {
        bytes32 questionId;
        address oracle;
        uint256 outcomeSlotCount;
        bytes32 conditionId;
        bool isResolved;
        uint256 payoutNumerator; // 0 for NO, 1 for YES
    }

    // 交易類型
    enum MatchType {
        DIRECT,
        MINTING,
        MERGE
    }

    // 撮合結果事件
    event MatchExecuted(
        MatchType matchType,
        bytes32 indexed conditionId,
        address indexed user1,
        address indexed user2,
        uint256 amount,
        uint256 price1,
        uint256 price2
    );

    // 市場建立事件
    event MarketCreated(
        bytes32 indexed questionId,
        bytes32 indexed conditionId,
        address oracle,
        uint256 outcomeSlotCount
    );

    // State variables
    ConditionalTokens public conditionalTokens;
    Trading public trading;
    IERC20 public collateralToken; // USDC
    
    mapping(bytes32 => Market) public markets; // questionId => Market
    mapping(bytes32 => bool) public conditionExists; // conditionId => exists
    
    // 授權的後端地址
    mapping(address => bool) public authorizedBackends;

    constructor(
        address _conditionalTokens,
        address _collateralToken,
        address _trading
    ) Ownable(msg.sender) {
        conditionalTokens = ConditionalTokens(_conditionalTokens);
        collateralToken = IERC20(_collateralToken);
        trading = Trading(_trading);
    }

    modifier onlyAuthorizedBackend() {
        require(authorizedBackends[msg.sender], "Unauthorized backend");
        _;
    }

    // 授權後端地址
    function authorizeBackend(address backend) external onlyOwner {
        authorizedBackends[backend] = true;
    }

    function revokeBackend(address backend) external onlyOwner {
        authorizedBackends[backend] = false;
    }

    // 創建新市場
    function createMarket(
        bytes32 questionId,
        address oracle,
        uint256 outcomeSlotCount
    ) external onlyOwner returns (bytes32 conditionId) {
        require(markets[questionId].questionId == bytes32(0), "Market already exists");
        require(outcomeSlotCount == 2, "Only binary markets supported");

        // 準備條件
        conditionId = conditionalTokens.getConditionId(oracle, questionId, outcomeSlotCount);
        
        // 準備條件（如果還沒準備過）
        if (!conditionExists[conditionId]) {
            conditionalTokens.prepareCondition(oracle, questionId, outcomeSlotCount);
            conditionExists[conditionId] = true;
        }

        // 創建市場記錄
        markets[questionId] = Market({
            questionId: questionId,
            oracle: oracle,
            outcomeSlotCount: outcomeSlotCount,
            conditionId: conditionId,
            isResolved: false,
            payoutNumerator: 0
        });

        emit MarketCreated(questionId, conditionId, oracle, outcomeSlotCount);
        return conditionId;
    }

    // Direct Match: 傳統買賣撮合
    function executeDirectMatch(
        bytes32 questionId,
        address buyer,
        address seller,
        uint256 outcome, // 0 for NO, 1 for YES
        uint256 amount,
        uint256 price
    ) external onlyAuthorizedBackend nonReentrant {
        Market memory market = markets[questionId];
        require(market.questionId != bytes32(0), "Market not found");
        require(!market.isResolved, "Market resolved");
        require(outcome < market.outcomeSlotCount, "Invalid outcome");

        // 執行交易
        trading.executeDirectTrade(
            market.conditionId,
            buyer,
            seller,
            outcome,
            amount,
            price,
            address(collateralToken)
        );

        emit MatchExecuted(
            MatchType.DIRECT,
            market.conditionId,
            buyer,
            seller,
            amount,
            price,
            0
        );
    }

    // Minting: 雙買撮合 (Buy YES + Buy NO)
    function executeMinting(
        bytes32 questionId,
        address yesBuyer,
        address noBuyer,
        uint256 amount,
        uint256 priceYes,
        uint256 priceNo
    ) external onlyAuthorizedBackend nonReentrant {
        Market memory market = markets[questionId];
        require(market.questionId != bytes32(0), "Market not found");
        require(!market.isResolved, "Market resolved");
        require(priceYes + priceNo >= 1e6, "Insufficient total price"); // 至少 1 USDC (6 decimals)

        // 執行鑄造
        conditionalTokens.executeMinting(
            market.conditionId,
            yesBuyer,
            noBuyer,
            amount,
            priceYes,
            priceNo,
            address(collateralToken)
        );

        emit MatchExecuted(
            MatchType.MINTING,
            market.conditionId,
            yesBuyer,
            noBuyer,
            amount,
            priceYes,
            priceNo
        );
    }

    // Merge: 雙賣撮合 (Sell YES + Sell NO)
    function executeMerge(
        bytes32 questionId,
        address yesSeller,
        address noSeller,
        uint256 amount,
        uint256 priceYes,
        uint256 priceNo
    ) external onlyAuthorizedBackend nonReentrant {
        Market memory market = markets[questionId];
        require(market.questionId != bytes32(0), "Market not found");
        require(!market.isResolved, "Market resolved");
        require(priceYes + priceNo >= 1e6, "Insufficient total price"); // 至少 1 USDC (6 decimals)

        // 執行合併
        conditionalTokens.executeMerge(
            market.conditionId,
            yesSeller,
            noSeller,
            amount,
            priceYes,
            priceNo,
            address(collateralToken)
        );

        emit MatchExecuted(
            MatchType.MERGE,
            market.conditionId,
            yesSeller,
            noSeller,
            amount,
            priceYes,
            priceNo
        );
    }

    // Oracle 回報結果
    function reportPayouts(
        bytes32 questionId,
        uint256[] calldata payouts
    ) external {
        Market storage market = markets[questionId];
        require(market.questionId != bytes32(0), "Market not found");
        require(msg.sender == market.oracle, "Only oracle can report");
        require(!market.isResolved, "Already resolved");
        require(payouts.length == market.outcomeSlotCount, "Invalid payout length");

        // 儲存結果到 ConditionalTokens
        conditionalTokens.reportPayouts(market.questionId, payouts);
        
        // 更新市場狀態
        market.isResolved = true;
        market.payoutNumerator = payouts[1]; // YES 的支付率

        emit MarketResolved(questionId, market.conditionId, payouts);
    }

    event MarketResolved(bytes32 indexed questionId, bytes32 indexed conditionId, uint256[] payouts);

    // 查詢市場資訊
    function getMarket(bytes32 questionId) external view returns (Market memory) {
        return markets[questionId];
    }

    // 檢查條件是否存在
    function checkConditionExists(bytes32 conditionId) external view returns (bool) {
        return conditionExists[conditionId];
    }
}

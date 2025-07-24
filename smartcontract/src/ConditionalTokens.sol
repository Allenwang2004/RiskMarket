// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ConditionalTokens is ERC1155, Ownable {
    using SafeERC20 for IERC20;

    // 條件結構
    struct Condition {
        address oracle;
        bytes32 questionId;
        uint256 outcomeSlotCount;
        uint256[] payoutNumerators;
        bool resolved;
    }

    // State variables
    mapping(bytes32 => Condition) public conditions;
    mapping(bytes32 => mapping(uint256 => uint256)) public positionIds; // conditionId => outcome => positionId
    
    // Events
    event ConditionPrepared(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount
    );

    event PositionsMinted(
        bytes32 indexed conditionId,
        address indexed user,
        uint256 amount,
        uint256 outcome
    );

    event PositionsMerged(
        bytes32 indexed conditionId,
        address indexed user,
        uint256 amount
    );

    event PayoutReported(
        bytes32 indexed conditionId,
        uint256[] payoutNumerators
    );

    constructor() ERC1155("") Ownable(msg.sender) {}

    // 計算條件 ID
    function getConditionId(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(oracle, questionId, outcomeSlotCount));
    }

    // 計算位置 ID
    function getPositionId(bytes32 conditionId, uint256 outcome) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(conditionId, outcome)));
    }

    // 準備條件
    function prepareCondition(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) external {
        bytes32 conditionId = getConditionId(oracle, questionId, outcomeSlotCount);
        require(conditions[conditionId].oracle == address(0), "Condition already prepared");
        require(outcomeSlotCount > 1, "Invalid outcome slot count");

        conditions[conditionId] = Condition({
            oracle: oracle,
            questionId: questionId,
            outcomeSlotCount: outcomeSlotCount,
            payoutNumerators: new uint256[](0),
            resolved: false
        });

        // 預先計算所有可能的位置 ID
        for (uint256 i = 0; i < outcomeSlotCount; i++) {
            positionIds[conditionId][i] = getPositionId(conditionId, i);
        }

        emit ConditionPrepared(conditionId, oracle, questionId, outcomeSlotCount);
    }

    // Minting: 鑄造 YES 和 NO token
    function executeMinting(
        bytes32 conditionId,
        address yesBuyer,
        address noBuyer,
        uint256 amount,
        uint256 priceYes,
        uint256 priceNo,
        address collateralToken
    ) external {
        Condition memory condition = conditions[conditionId];
        require(condition.oracle != address(0), "Condition not prepared");
        require(!condition.resolved, "Condition resolved");

        IERC20 collateral = IERC20(collateralToken);
        
        // 從買家收取 USDC
        collateral.safeTransferFrom(yesBuyer, address(this), priceYes);
        collateral.safeTransferFrom(noBuyer, address(this), priceNo);

        // 鑄造 YES token (outcome 1) 給 YES 買家
        uint256 yesPositionId = positionIds[conditionId][1];
        _mint(yesBuyer, yesPositionId, amount, "");

        // 鑄造 NO token (outcome 0) 給 NO 買家
        uint256 noPositionId = positionIds[conditionId][0];
        _mint(noBuyer, noPositionId, amount, "");

        emit PositionsMinted(conditionId, yesBuyer, amount, 1);
        emit PositionsMinted(conditionId, noBuyer, amount, 0);
    }

    // Merge: 銷毀 YES 和 NO token，退還 USDC
    function executeMerge(
        bytes32 conditionId,
        address yesSeller,
        address noSeller,
        uint256 amount,
        uint256 priceYes,
        uint256 priceNo,
        address collateralToken
    ) external {
        Condition memory condition = conditions[conditionId];
        require(condition.oracle != address(0), "Condition not prepared");
        require(!condition.resolved, "Condition resolved");

        uint256 yesPositionId = positionIds[conditionId][1];
        uint256 noPositionId = positionIds[conditionId][0];

        // 檢查賣家擁有足夠的 token
        require(balanceOf(yesSeller, yesPositionId) >= amount, "Insufficient YES tokens");
        require(balanceOf(noSeller, noPositionId) >= amount, "Insufficient NO tokens");

        // 銷毀 token
        _burn(yesSeller, yesPositionId, amount);
        _burn(noSeller, noPositionId, amount);

        IERC20 collateral = IERC20(collateralToken);
        
        // 支付給賣家
        collateral.safeTransfer(yesSeller, priceYes);
        collateral.safeTransfer(noSeller, priceNo);

        emit PositionsMerged(conditionId, yesSeller, amount);
        emit PositionsMerged(conditionId, noSeller, amount);
    }

    // Oracle 回報結果
    function reportPayouts(
        bytes32 questionId,
        uint256[] calldata payouts
    ) external {
        // 這裡應該由 CTFExchange 調用，但為了簡化，我們直接實現
        // 在實際應用中，需要更嚴格的權限控制
        
        // 找到對應的條件
        // 注意：這裡需要遍歷或使用更好的索引方式
        // 為了簡化，我們假設可以直接計算 conditionId
    }

    // 用戶贖回獲勝的 token
    function redeemPositions(
        bytes32 conditionId,
        uint256[] calldata outcomes,
        uint256[] calldata amounts
    ) external {
        Condition memory condition = conditions[conditionId];
        require(condition.resolved, "Condition not resolved");
        require(outcomes.length == amounts.length, "Length mismatch");

        IERC20 collateral = IERC20(address(0)); // 需要從外部傳入
        uint256 totalPayout = 0;

        for (uint256 i = 0; i < outcomes.length; i++) {
            uint256 outcome = outcomes[i];
            uint256 amount = amounts[i];
            uint256 positionId = positionIds[conditionId][outcome];

            require(balanceOf(msg.sender, positionId) >= amount, "Insufficient position tokens");

            // 計算支付金額（基於結果）
            uint256 payout = (amount * condition.payoutNumerators[outcome]) / 1e18;
            totalPayout += payout;

            // 銷毀 token
            _burn(msg.sender, positionId, amount);
        }

        // 支付 USDC
        if (totalPayout > 0) {
            collateral.safeTransfer(msg.sender, totalPayout);
        }
    }

    // 查詢函數
    function getCondition(bytes32 conditionId) external view returns (Condition memory) {
        return conditions[conditionId];
    }

    function getPositionBalance(
        address user,
        bytes32 conditionId,
        uint256 outcome
    ) external view returns (uint256) {
        uint256 positionId = positionIds[conditionId][outcome];
        return balanceOf(user, positionId);
    }
}

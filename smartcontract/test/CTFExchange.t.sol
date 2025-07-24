// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/CTFExchange.sol";
import "../src/ConditionalTokens.sol";
import "../src/Trading.sol";
import "../script/Deploy.s.sol";

contract CTFExchangeTest is Test {
    CTFExchange public ctfExchange;
    ConditionalTokens public conditionalTokens;
    Trading public trading;
    MockUSDC public usdc;

    address public owner;
    address public backend;
    address public oracle;
    address public user1;
    address public user2;
    address public user3;

    bytes32 public questionId;
    bytes32 public conditionId;

    function setUp() public {
        owner = address(this);
        backend = address(0xBEEF);
        oracle = address(0x0123456789abcDEF0123456789abCDef01234567);
        user1 = address(0x1111);
        user2 = address(0x2222);
        user3 = address(0x3333);

        // Deploy contracts
        usdc = new MockUSDC();
        conditionalTokens = new ConditionalTokens();
        trading = new Trading();
        ctfExchange = new CTFExchange(
            address(conditionalTokens),
            address(usdc),
            address(trading)
        );

        // Setup authorizations
        trading.authorizeCaller(address(ctfExchange));
        trading.setConditionalTokensAddress(address(conditionalTokens));
        ctfExchange.authorizeBackend(backend);

        // Create test market
        questionId = keccak256("Test Question");
        conditionId = ctfExchange.createMarket(questionId, oracle, 2);

        // Mint USDC to users
        usdc.mint(user1, 10000 * 10**6);
        usdc.mint(user2, 10000 * 10**6);
        usdc.mint(user3, 10000 * 10**6);

        // Approve USDC spending
        vm.prank(user1);
        usdc.approve(address(conditionalTokens), type(uint256).max);
        vm.prank(user2);
        usdc.approve(address(conditionalTokens), type(uint256).max);
        vm.prank(user3);
        usdc.approve(address(conditionalTokens), type(uint256).max);

        vm.prank(user1);
        usdc.approve(address(trading), type(uint256).max);
        vm.prank(user2);
        usdc.approve(address(trading), type(uint256).max);
        vm.prank(user3);
        usdc.approve(address(trading), type(uint256).max);
    }

    function testMinting() public {
        uint256 amount = 100;
        uint256 priceYes = 0.6e6; // 0.6 USDC (6 decimals)
        uint256 priceNo = 0.5e6;  // 0.5 USDC

        uint256 user1BalanceBefore = usdc.balanceOf(user1);
        uint256 user2BalanceBefore = usdc.balanceOf(user2);

        vm.prank(backend);
        ctfExchange.executeMinting(
            questionId,
            user1, // YES buyer
            user2, // NO buyer
            amount,
            priceYes,
            priceNo
        );

        // Check USDC balances
        assertEq(usdc.balanceOf(user1), user1BalanceBefore - priceYes);
        assertEq(usdc.balanceOf(user2), user2BalanceBefore - priceNo);

        // Check position balances
        assertEq(conditionalTokens.getPositionBalance(user1, conditionId, 1), amount); // YES
        assertEq(conditionalTokens.getPositionBalance(user2, conditionId, 0), amount); // NO
    }

    function testMerge() public {
        // First mint some positions
        uint256 amount = 100;
        uint256 mintPriceYes = 0.6e6;
        uint256 mintPriceNo = 0.5e6;

        vm.prank(backend);
        ctfExchange.executeMinting(
            questionId,
            user1, // YES buyer
            user2, // NO buyer
            amount,
            mintPriceYes,
            mintPriceNo
        );

        // Approve position transfers
        vm.prank(user1);
        conditionalTokens.setApprovalForAll(address(conditionalTokens), true);
        vm.prank(user2);
        conditionalTokens.setApprovalForAll(address(conditionalTokens), true);

        // Now merge (sell positions)
        uint256 sellPriceYes = 0.7e6;
        uint256 sellPriceNo = 0.4e6;

        uint256 user1BalanceBefore = usdc.balanceOf(user1);
        uint256 user2BalanceBefore = usdc.balanceOf(user2);

        vm.prank(backend);
        ctfExchange.executeMerge(
            questionId,
            user1, // YES seller
            user2, // NO seller
            amount,
            sellPriceYes,
            sellPriceNo
        );

        // Check USDC balances (users should receive money)
        assertEq(usdc.balanceOf(user1), user1BalanceBefore + sellPriceYes);
        assertEq(usdc.balanceOf(user2), user2BalanceBefore + sellPriceNo);

        // Check position balances (should be zero)
        assertEq(conditionalTokens.getPositionBalance(user1, conditionId, 1), 0); // YES
        assertEq(conditionalTokens.getPositionBalance(user2, conditionId, 0), 0); // NO
    }

    function testDirectMatch() public {
        // First mint some positions for user1 to sell
        uint256 amount = 100;
        uint256 mintPrice = 1.1e6; // Total > 1 USDC

        vm.prank(backend);
        ctfExchange.executeMinting(
            questionId,
            user1, // YES buyer
            user2, // NO buyer  
            amount,
            0.6e6,
            0.5e6
        );

        // Approve position transfers
        vm.prank(user1);
        conditionalTokens.setApprovalForAll(address(trading), true);

        // user3 buys YES position from user1
        uint256 tradePrice = 0.65e6;
        
        uint256 user1BalanceBefore = usdc.balanceOf(user1);
        uint256 user3BalanceBefore = usdc.balanceOf(user3);

        vm.prank(backend);
        ctfExchange.executeDirectMatch(
            questionId,
            user3, // buyer
            user1, // seller
            1,     // YES outcome
            50,    // amount
            tradePrice
        );

        // Check USDC balances
        assertEq(usdc.balanceOf(user1), user1BalanceBefore + tradePrice);
        assertEq(usdc.balanceOf(user3), user3BalanceBefore - tradePrice);

        // Check position balances
        assertEq(conditionalTokens.getPositionBalance(user1, conditionId, 1), 50); // 100 - 50 = 50
        assertEq(conditionalTokens.getPositionBalance(user3, conditionId, 1), 50); // bought 50
    }

    function testUnauthorizedBackend() public {
        vm.expectRevert("Unauthorized backend");
        vm.prank(user1); // user1 is not authorized backend
        ctfExchange.executeMinting(
            questionId,
            user1,
            user2,
            100,
            0.6e6,
            0.5e6
        );
    }

    function testInvalidMarket() public {
        bytes32 invalidQuestionId = keccak256("Invalid Question");
        
        vm.expectRevert("Market not found");
        vm.prank(backend);
        ctfExchange.executeMinting(
            invalidQuestionId,
            user1,
            user2,
            100,
            0.6e6,
            0.5e6
        );
    }
}

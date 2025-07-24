// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CTFExchange.sol";
import "../src/ConditionalTokens.sol";
import "../src/Trading.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock USDC for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {
        // Mint 1 million USDC to deployer for testing
        _mint(msg.sender, 1_000_000 * 10**6); // 6 decimals for USDC
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // Allow anyone to mint for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployScript is Script {
    function run() external {
        // Start broadcasting transactions
        vm.startBroadcast();

        // Deploy Mock USDC
        MockUSDC usdc = new MockUSDC();
        console.log("Mock USDC deployed at:", address(usdc));

        // Deploy ConditionalTokens
        ConditionalTokens conditionalTokens = new ConditionalTokens();
        console.log("ConditionalTokens deployed at:", address(conditionalTokens));

        // Deploy Trading
        Trading trading = new Trading();
        console.log("Trading deployed at:", address(trading));

        // Deploy CTFExchange
        CTFExchange ctfExchange = new CTFExchange(
            address(conditionalTokens),
            address(usdc),
            address(trading)
        );
        console.log("CTFExchange deployed at:", address(ctfExchange));

        // Setup authorizations
        trading.authorizeCaller(address(ctfExchange));
        trading.setConditionalTokensAddress(address(conditionalTokens));
        
        // For testing, authorize the deployer as backend
        ctfExchange.authorizeBackend(msg.sender);

        // Create a test market
        bytes32 questionId = keccak256("Will ETH reach $5000 by end of 2024?");
        address oracle = msg.sender; // Use deployer as oracle for testing
        bytes32 conditionId = ctfExchange.createMarket(questionId, oracle, 2);
        
        console.log("Test market created with questionId:", vm.toString(questionId));
        console.log("ConditionId:", vm.toString(conditionId));

        // Mint some USDC to test accounts for testing
        address testUser1 = address(0x1111111111111111111111111111111111111111);
        address testUser2 = address(0x2222222222222222222222222222222222222222);
        address testUser3 = address(0x3333333333333333333333333333333333333333);

        usdc.mint(testUser1, 10000 * 10**6); // 10,000 USDC
        usdc.mint(testUser2, 10000 * 10**6); // 10,000 USDC
        usdc.mint(testUser3, 10000 * 10**6); // 10,000 USDC

        console.log("Minted USDC to test users");
        console.log("TestUser1:", testUser1);
        console.log("TestUser2:", testUser2);
        console.log("TestUser3:", testUser3);

        vm.stopBroadcast();

        // Save deployment addresses to a file
        string memory deploymentInfo = string(abi.encodePacked(
            "USDC_ADDRESS=", vm.toString(address(usdc)), "\n",
            "CONDITIONAL_TOKENS_ADDRESS=", vm.toString(address(conditionalTokens)), "\n",
            "TRADING_ADDRESS=", vm.toString(address(trading)), "\n",
            "CTF_EXCHANGE_ADDRESS=", vm.toString(address(ctfExchange)), "\n",
            "TEST_QUESTION_ID=", vm.toString(questionId), "\n",
            "TEST_CONDITION_ID=", vm.toString(conditionId), "\n",
            "TEST_USER_1=", vm.toString(testUser1), "\n",
            "TEST_USER_2=", vm.toString(testUser2), "\n",
            "TEST_USER_3=", vm.toString(testUser3), "\n"
        ));

        vm.writeFile("deployment.env", deploymentInfo);
        console.log("Deployment addresses saved to deployment.env");
    }
}

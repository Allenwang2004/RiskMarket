import { ethers } from 'ethers';

// 全局 window 對象擴展
declare global {
    interface Window {
        ethereum: any;
    }
}

// 合約地址
const ENHANCED_PREDICTION_MARKET_ADDRESS = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
const YES_TOKEN_ADDRESS = '0x856e4424f806D16E8CBC702B3c0F2ede5468eae5';
const NO_TOKEN_ADDRESS = '0xb0279Db6a2F1E01fbC8483FCCef0Be2bC6299cC3';
const ORDER_BOOK_ADDRESS = '0x3dE2Da43d4c1B137E385F36b400507c1A24401f8';

// 合約 ABI
const ENHANCED_PREDICTION_MARKET_ABI = [
    "function question() view returns (string)",
    "function endTime() view returns (uint256)",
    "function resolutionTime() view returns (uint256)",
    "function oracle() view returns (address)",
    "function resolved() view returns (bool)",
    "function outcome() view returns (uint8)",
    "function yesToken() view returns (address)",
    "function noToken() view returns (address)",
    "function orderBook() view returns (address)",
    "function getTotalPool() view returns (uint256)",
    "function getUserShares(address user) view returns (uint256 yes, uint256 no)",
    "function buyYesShares() payable",
    "function buyNoShares() payable",
    "function placeOrder(bool isYes, uint256 price, uint256 amount) payable",
    "function addLiquidity() payable",
    "function claimWinnings()",
    "function claimLPRewards()",
    "event SharesPurchased(address indexed user, bool isYes, uint256 amount)",
    "event OrderPlaced(address indexed user, bool isYes, uint256 price, uint256 amount)",
    "event LiquidityAdded(address indexed provider, uint256 amount)"
];

const ORDER_BOOK_ABI = [
    "function placeOrder(bool isYes, uint256 price, uint256 amount) payable",
    "function cancelOrder(uint256 orderId)",
    "function getOrderBook(bool isYes) view returns (tuple(uint256 orderId, address user, uint256 price, uint256 amount, uint256 timestamp)[])",
    "function getMarketPrice(bool isYes) view returns (uint256)",
    "function getUserOrders(address user) view returns (uint256[])",
    "function getOrder(uint256 orderId) view returns (tuple(uint256 orderId, address user, bool isYes, uint256 price, uint256 amount, uint256 timestamp, bool isActive))",
    "event OrderPlaced(uint256 indexed orderId, address indexed user, bool isYes, uint256 price, uint256 amount)",
    "event OrderMatched(uint256 indexed buyOrderId, uint256 indexed sellOrderId, uint256 price, uint256 amount)",
    "event OrderCancelled(uint256 indexed orderId)"
];

const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// 類型定義
interface OrderData {
    orderId: bigint;
    user: string;
    price: bigint;
    amount: bigint;
    timestamp: bigint;
}

interface OrderDetails {
    orderId: bigint;
    user: string;
    isYes: boolean;
    price: bigint;
    amount: bigint;
    timestamp: bigint;
    isActive: boolean;
}

// 全局變數
let provider: ethers.BrowserProvider | null = null;
let signer: ethers.JsonRpcSigner | null = null;
let userAddress: string | null = null;
let enhancedPredictionMarketContract: ethers.Contract | null = null;
let orderBookContract: ethers.Contract | null = null;
let yesTokenContract: ethers.Contract | null = null;
let noTokenContract: ethers.Contract | null = null;

// 後端連接
const BACKEND_URL = 'http://localhost:3001';
let ws: WebSocket | null = null;

// 訂單簿狀態
let currentOrderType: 'buy' | 'sell' = 'buy';
let currentToken: 'yes' | 'no' = 'yes';
let currentTradeType: 'limit' | 'market' = 'limit'; // 新增：當前交易類型

// DOM 元素
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement;
const walletInfo = document.getElementById('walletInfo') as HTMLDivElement;
const walletAddress = document.getElementById('walletAddress') as HTMLParagraphElement;
const ethBalance = document.getElementById('ethBalance') as HTMLParagraphElement;
const networkName = document.getElementById('networkName') as HTMLParagraphElement;
const yesBalance = document.getElementById('yesBalance') as HTMLParagraphElement;
const noBalance = document.getElementById('noBalance') as HTMLParagraphElement;
const marketQuestion = document.getElementById('marketQuestion') as HTMLParagraphElement;
const totalPool = document.getElementById('totalPool') as HTMLParagraphElement;
const yesTotalSupply = document.getElementById('yesTotalSupply') as HTMLParagraphElement;
const noTotalSupply = document.getElementById('noTotalSupply') as HTMLParagraphElement;
const endTime = document.getElementById('endTime') as HTMLParagraphElement;
const buyYesButton = document.getElementById('buyYesButton') as HTMLButtonElement;
const buyNoButton = document.getElementById('buyNoButton') as HTMLButtonElement;
const yesAmount = document.getElementById('yesAmount') as HTMLInputElement;
const noAmount = document.getElementById('noAmount') as HTMLInputElement;
const messageArea = document.getElementById('messageArea') as HTMLDivElement;

// 訂單簿相關 DOM 元素
const buyOrderTypeBtn = document.getElementById('buyOrderTypeBtn') as HTMLButtonElement;
const sellOrderTypeBtn = document.getElementById('sellOrderTypeBtn') as HTMLButtonElement;
const yesTokenBtn = document.getElementById('yesTokenBtn') as HTMLButtonElement;
const noTokenBtn = document.getElementById('noTokenBtn') as HTMLButtonElement;
const limitOrderBtn = document.getElementById('limitOrderBtn') as HTMLButtonElement; // 新增
const marketOrderBtn = document.getElementById('marketOrderBtn') as HTMLButtonElement; // 新增
const orderPrice = document.getElementById('orderPrice') as HTMLInputElement;
const orderAmount = document.getElementById('orderAmount') as HTMLInputElement;
const placeOrderBtn = document.getElementById('placeOrderBtn') as HTMLButtonElement;
const priceInputGroup = document.getElementById('priceInputGroup') as HTMLDivElement; // 新增
const marketOrderInfo = document.getElementById('marketOrderInfo') as HTMLDivElement; // 新增
const estimatedPrice = document.getElementById('estimatedPrice') as HTMLSpanElement; // 新增
const estimatedAmount = document.getElementById('estimatedAmount') as HTMLSpanElement; // 新增
const estimatedTotal = document.getElementById('estimatedTotal') as HTMLSpanElement; // 新增
const yesMarketPrice = document.getElementById('yesMarketPrice') as HTMLParagraphElement;
const noMarketPrice = document.getElementById('noMarketPrice') as HTMLParagraphElement;
const myOrdersList = document.getElementById('myOrdersList') as HTMLDivElement;

// 設置事件監聽器
function setupEventListeners(): void {
    connectButton?.addEventListener('click', connectWallet);
    disconnectButton?.addEventListener('click', disconnectWallet);
    buyYesButton?.addEventListener('click', () => buyShares(true));
    buyNoButton?.addEventListener('click', () => buyShares(false));
    
        // 訂單簿事件監聽器
    buyOrderTypeBtn?.addEventListener('click', () => setOrderType('buy'));
    sellOrderTypeBtn?.addEventListener('click', () => setOrderType('sell'));
    yesTokenBtn?.addEventListener('click', () => setTokenType('yes'));
    noTokenBtn?.addEventListener('click', () => setTokenType('no'));
    limitOrderBtn?.addEventListener('click', () => setTradeType('limit'));
    marketOrderBtn?.addEventListener('click', () => setTradeType('market'));
    placeOrderBtn?.addEventListener('click', placeOrderToBackend);
    
    // 監聽數量變化以更新市價單預估
    orderAmount?.addEventListener('input', updateMarketOrderEstimate);
    
    // 監聽帳戶變更
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
    }
}

// 連接錢包
async function connectWallet(): Promise<void> {
    try {
        showLoading('連接錢包中...');
        
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        if (accounts.length > 0) {
            userAddress = accounts[0];
            
            // 創建 provider 和 signer
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            
            // 創建合約實例
            enhancedPredictionMarketContract = new ethers.Contract(
                ENHANCED_PREDICTION_MARKET_ADDRESS, 
                ENHANCED_PREDICTION_MARKET_ABI, 
                signer
            );
            
            orderBookContract = new ethers.Contract(
                ORDER_BOOK_ADDRESS,
                ORDER_BOOK_ABI,
                signer
            );
            
            yesTokenContract = new ethers.Contract(
                YES_TOKEN_ADDRESS,
                ERC20_ABI,
                signer
            );
            
            noTokenContract = new ethers.Contract(
                NO_TOKEN_ADDRESS,
                ERC20_ABI,
                signer
            );
            
            console.log('✅ 錢包連接成功:', userAddress);
            
            // 更新 UI
            await updateWalletInfo();
            await updateTokenBalances();
            await loadMarketData();
            await connectToBackend();
            await loadMyOrdersFromBackend();
            
            showSuccess('錢包連接成功！');
        }
    } catch (error: any) {
        console.error('❌ 連接錢包失敗:', error);
        showError('連接錢包失敗: ' + error.message);
    }
}

// 斷開錢包連接
async function disconnectWallet(): Promise<void> {
    try {
        showLoading('斷開連接中...');
        
        // 斷開 WebSocket 連接
        if (ws) {
            ws.close();
            ws = null;
        }
        
        // 清除所有變數
        provider = null;
        signer = null;
        userAddress = null;
        enhancedPredictionMarketContract = null;
        orderBookContract = null;
        yesTokenContract = null;
        noTokenContract = null;
        
        // 重置 UI
        resetWalletUI();
        
        console.log('✅ 錢包已斷開連接');
        showSuccess('錢包已成功斷開連接！');
        
    } catch (error: any) {
        console.error('❌ 斷開連接失敗:', error);
        showError('斷開連接失敗: ' + error.message);
    }
}

// 檢查連接狀態
async function checkConnection(): Promise<void> {
    try {
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                userAddress = accounts[0];
                provider = new ethers.BrowserProvider(window.ethereum);
                signer = await provider.getSigner();
                
                // 創建合約實例
                enhancedPredictionMarketContract = new ethers.Contract(
                    ENHANCED_PREDICTION_MARKET_ADDRESS,
                    ENHANCED_PREDICTION_MARKET_ABI,
                    signer
                );
                
                orderBookContract = new ethers.Contract(
                    ORDER_BOOK_ADDRESS,
                    ORDER_BOOK_ABI,
                    signer
                );
                
                yesTokenContract = new ethers.Contract(
                    YES_TOKEN_ADDRESS,
                    ERC20_ABI,
                    signer
                );
                
                noTokenContract = new ethers.Contract(
                    NO_TOKEN_ADDRESS,
                    ERC20_ABI,
                    signer
                );
                
                console.log('✅ 自動連接錢包成功:', userAddress);
                await updateWalletInfo();
                await updateTokenBalances();
                await connectToBackend();
                await loadMyOrdersFromBackend();
            }
        }
    } catch (error) {
        console.error('❌ 檢查連接狀態失敗:', error);
    }
}

// 處理帳戶變更
async function handleAccountsChanged(accounts: string[]): Promise<void> {
    if (accounts.length === 0) {
        console.log('👋 帳戶已斷開連接');
        await disconnectWallet();
    } else {
        console.log('🔄 帳戶已更改:', accounts[0]);
        userAddress = accounts[0];
        await updateWalletInfo();
        await updateTokenBalances();
        await connectToBackend();
        await loadMyOrdersFromBackend();
    }
}

// 處理網路變更
async function handleChainChanged(chainId: string): Promise<void> {
    console.log('🌐 網路已更改:', chainId);
    window.location.reload();
}

// 更新錢包信息
async function updateWalletInfo(): Promise<void> {
    if (!provider || !userAddress) return;
    
    try {
        const balance = await provider.getBalance(userAddress);
        const network = await provider.getNetwork();
        
        if (walletAddress) walletAddress.textContent = `地址: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        if (ethBalance) ethBalance.textContent = `餘額: ${ethers.formatEther(balance)} ETH`;
        if (networkName) networkName.textContent = `網路: ${network.name} (${network.chainId})`;
        
        if (connectButton) connectButton.style.display = 'none';
        if (disconnectButton) disconnectButton.style.display = 'inline-block';
        if (walletInfo) walletInfo.style.display = 'block';
    } catch (error) {
        console.error('❌ 更新錢包信息失敗:', error);
    }
}

// 重置錢包 UI
function resetWalletUI(): void {
    if (connectButton) connectButton.style.display = 'inline-block';
    if (disconnectButton) disconnectButton.style.display = 'none';
    if (walletInfo) walletInfo.style.display = 'none';
    
    if (walletAddress) walletAddress.textContent = '';
    if (ethBalance) ethBalance.textContent = '';
    if (networkName) networkName.textContent = '';
    if (yesBalance) yesBalance.textContent = '';
    if (noBalance) noBalance.textContent = '';
    
    // 清空訂單列表
    if (myOrdersList) myOrdersList.innerHTML = '';
    if (myOrdersList) myOrdersList.innerHTML = '';
}

// 更新代幣餘額
async function updateTokenBalances(): Promise<void> {
    if (!userAddress || !yesTokenContract || !noTokenContract) return;
    
    try {
        const yesBalanceValue = await yesTokenContract.balanceOf(userAddress);
        const noBalanceValue = await noTokenContract.balanceOf(userAddress);
        
        if (yesBalance) yesBalance.textContent = `YES 代幣: ${ethers.formatEther(yesBalanceValue)}`;
        if (noBalance) noBalance.textContent = `NO 代幣: ${ethers.formatEther(noBalanceValue)}`;
    } catch (error) {
        console.error('❌ 更新代幣餘額失敗:', error);
    }
}

// 載入市場數據
async function loadMarketData(): Promise<void> {
    if (!enhancedPredictionMarketContract || !yesTokenContract || !noTokenContract) return;
    
    try {
        showLoading('載入市場數據中...');
        
        // 獲取市場信息
        const question = await enhancedPredictionMarketContract.question();
        const pool = await enhancedPredictionMarketContract.getTotalPool();
        const yesTotalSupplyValue = await yesTokenContract.totalSupply();
        const noTotalSupplyValue = await noTokenContract.totalSupply();
        const endTimeValue = await enhancedPredictionMarketContract.endTime();
        
        // 更新 UI
        if (marketQuestion) marketQuestion.textContent = `問題: ${question}`;
        if (totalPool) totalPool.textContent = `總資金池: ${ethers.formatEther(pool)} ETH`;
        if (yesTotalSupply) yesTotalSupply.textContent = `YES 總供應量: ${ethers.formatEther(yesTotalSupplyValue)}`;
        if (noTotalSupply) noTotalSupply.textContent = `NO 總供應量: ${ethers.formatEther(noTotalSupplyValue)}`;
        
        const endDate = new Date(Number(endTimeValue) * 1000);
        if (endTime) endTime.textContent = `結束時間: ${endDate.toLocaleString()}`;
        
        // 載入訂單簿數據 (從後端)
        await loadOrderBookFromBackend();
        await loadMarketPricesFromBackend();
        
        hideMessage();
    } catch (error) {
        console.error('❌ 載入市場數據失敗:', error);
        showError('載入市場數據失敗: ' + (error as Error).message);
    }
}

// 購買股份
async function buyShares(isYes: boolean): Promise<void> {
    if (!enhancedPredictionMarketContract || !signer) {
        showError('請先連接錢包');
        return;
    }
    
    try {
        const amountInput = isYes ? yesAmount : noAmount;
        const amount = amountInput?.value;
        
        if (!amount || parseFloat(amount) <= 0) {
            showError('請輸入有效的金額');
            return;
        }
        
        showLoading(`購買 ${isYes ? 'YES' : 'NO'} 股份中...`);
        
        const value = ethers.parseEther(amount);
        const tx = isYes ? 
            await enhancedPredictionMarketContract.buyYesShares({ value }) :
            await enhancedPredictionMarketContract.buyNoShares({ value });
        
        console.log('🔄 交易已提交:', tx.hash);
        showLoading('等待交易確認...');
        
        const receipt = await tx.wait();
        console.log('✅ 交易已確認:', receipt.hash);
        
        // 更新 UI
        await updateTokenBalances();
        await loadMarketData();
        
        if (amountInput) amountInput.value = '';
        showSuccess(`成功購買 ${isYes ? 'YES' : 'NO'} 股份！`);
        
    } catch (error) {
        console.error(`❌ 購買 ${isYes ? 'YES' : 'NO'} 股份失敗:`, error);
        showError(`購買失敗: ${(error as Error).message}`);
    }
}

// 設置訂單類型
function setOrderType(type: 'buy' | 'sell'): void {
    currentOrderType = type;
    
    if (type === 'buy') {
        buyOrderTypeBtn?.classList.add('active');
        sellOrderTypeBtn?.classList.remove('active');
    } else {
        buyOrderTypeBtn?.classList.remove('active');
        sellOrderTypeBtn?.classList.add('active');
    }
    
    updatePlaceOrderButton();
}

// 設置代幣類型
function setTokenType(token: 'yes' | 'no'): void {
    currentToken = token;
    
    if (token === 'yes') {
        yesTokenBtn?.classList.add('active');
        noTokenBtn?.classList.remove('active');
    } else {
        yesTokenBtn?.classList.remove('active');
        noTokenBtn?.classList.add('active');
    }
    
    updatePlaceOrderButton();
    updateMarketOrderEstimate();
}

// 設置交易類型
function setTradeType(type: 'limit' | 'market'): void {
    currentTradeType = type;
    
    if (type === 'limit') {
        limitOrderBtn?.classList.add('active');
        marketOrderBtn?.classList.remove('active');
        // 顯示價格輸入框，隱藏市價單信息
        if (priceInputGroup) priceInputGroup.style.display = 'block';
        if (marketOrderInfo) marketOrderInfo.style.display = 'none';
    } else {
        limitOrderBtn?.classList.remove('active');
        marketOrderBtn?.classList.add('active');
        // 隱藏價格輸入框，顯示市價單信息
        if (priceInputGroup) priceInputGroup.style.display = 'none';
        if (marketOrderInfo) marketOrderInfo.style.display = 'block';
        updateMarketOrderEstimate();
    }
    
    updatePlaceOrderButton();
}

// 更新市價單預估
async function updateMarketOrderEstimate(): Promise<void> {
    if (currentTradeType !== 'market' || !orderAmount?.value) {
        return;
    }

    try {
        const amount = orderAmount.value;
        if (parseFloat(amount) <= 0) {
            return;
        }

        const response = await fetch(`${BACKEND_URL}/api/estimate-market-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tokenType: currentToken,
                orderType: currentOrderType,
                amount: amount
            })
        });

        const result = await response.json();
        
        if (result.success) {
            const estimate = result.data;
            if (estimatedPrice) estimatedPrice.textContent = estimate.estimatedPrice + ' ETH';
            if (estimatedAmount) estimatedAmount.textContent = estimate.estimatedAmount + ' tokens';
            if (estimatedTotal) estimatedTotal.textContent = estimate.estimatedTotal + ' ETH';
        } else {
            // 清空預估信息
            if (estimatedPrice) estimatedPrice.textContent = '-';
            if (estimatedAmount) estimatedAmount.textContent = '-';
            if (estimatedTotal) estimatedTotal.textContent = '-';
        }
    } catch (error) {
        console.error('預估市價單失敗:', error);
    }
}

// 更新下單按鈕文字
function updatePlaceOrderButton(): void {
    const action = currentOrderType === 'buy' ? '買入' : '賣出';
    const token = currentToken === 'yes' ? 'YES' : 'NO';
    const tradeTypeText = currentTradeType === 'limit' ? '限價' : '市價';
    if (placeOrderBtn) placeOrderBtn.textContent = `${tradeTypeText}${action} ${token}`;
}

// 連接到後端 WebSocket
async function connectToBackend(): Promise<void> {
    try {
        if (ws) {
            ws.close();
        }

        ws = new WebSocket(`ws://localhost:3001`);

        ws.onopen = () => {
            console.log('✅ 已連接到交易引擎');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleBackendMessage(message);
            } catch (error) {
                console.error('❌ 解析 WebSocket 訊息失敗:', error);
            }
        };

        ws.onclose = () => {
            console.log('🔌 與交易引擎的連接已斷開');
            // 5秒後嘗試重新連接
            setTimeout(() => {
                if (userAddress) {
                    connectToBackend();
                }
            }, 5000);
        };

        ws.onerror = (error) => {
            console.error('❌ WebSocket 連接錯誤:', error);
        };

    } catch (error) {
        console.error('❌ 連接到後端失敗:', error);
    }
}

// 處理後端訊息
function handleBackendMessage(message: any): void {
    switch (message.type) {
        case 'connected':
            console.log('🎉 已連接到交易引擎:', message.data.clientId);
            break;
            
        case 'order_submitted':
            console.log('📝 訂單已提交:', message.data);
            showSuccess('訂單已提交到交易引擎！');
            if (message.data.matches && message.data.matches.length > 0) {
                showSuccess(`恭喜！您的訂單已成功撮合 ${message.data.matches.length} 筆交易！`);
            }
            break;
            
        case 'order_matched':
            console.log('🎯 訂單撮合成功:', message.data);
            showSuccess(`交易撮合成功！價格: ${message.data.matchedPrice} ETH，數量: ${message.data.matchedAmount}`);
            break;
            
        case 'order_cancelled':
            console.log('❌ 訂單已取消:', message.data);
            showSuccess('訂單已取消！');
            break;
            
        case 'orderbook_update':
            console.log('📊 訂單簿已更新');
            updateOrderBookDisplay(message.data);
            break;
            
        default:
            console.log('📨 收到未知訊息類型:', message.type);
    }
}

// 更新訂單簿顯示
function updateOrderBookDisplay(data: any): void {
    if (data.yes) {
        updateOrderBookTable(data.yes.buyOrders, data.yes.sellOrders, 'yes');
    }
    if (data.no) {
        updateOrderBookTable(data.no.buyOrders, data.no.sellOrders, 'no');
    }
}

// 更新訂單簿表格
function updateOrderBookTable(buyOrders: any[], sellOrders: any[], tokenType: 'yes' | 'no'): void {
    const asksContainer = document.getElementById(`${tokenType}AsksList`);
    const bidsContainer = document.getElementById(`${tokenType}BidsList`);
    const lastPriceElement = document.getElementById(`${tokenType}LastPrice`);
    const spreadElement = document.getElementById(`${tokenType}Spread`);
    
    // 更新賣單 (Asks) - 從高到低價格排序，顯示最多5個
    if (asksContainer) {
        const sortedAsks = [...sellOrders].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 5);
        
        // 清空容器
        asksContainer.innerHTML = '';
        
        // 先添加實際訂單
        sortedAsks.forEach(order => {
            const orderDiv = document.createElement('div');
            orderDiv.className = 'active-order ask-order';
            
            const total = (parseFloat(order.price) * parseFloat(order.amount)).toFixed(4);
            
            orderDiv.innerHTML = `
                <span>${parseFloat(order.price).toFixed(2)}¢</span>
                <span>${parseFloat(order.amount).toFixed(2)}</span>
                <span>$${total}</span>
            `;
            
            asksContainer.appendChild(orderDiv);
        });
        
        // 添加空白行填滿5行
        for (let i = sortedAsks.length; i < 5; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-order ask-order';
            emptyDiv.innerHTML = `
                <span>--</span>
                <span>--</span>
                <span>--</span>
            `;
            asksContainer.appendChild(emptyDiv);
        }
    }
    
    // 更新買單 (Bids) - 從高到低價格排序，顯示最多5個
    if (bidsContainer) {
        const sortedBids = [...buyOrders].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 5);
        
        // 清空容器
        bidsContainer.innerHTML = '';
        
        // 先添加實際訂單
        sortedBids.forEach(order => {
            const orderDiv = document.createElement('div');
            orderDiv.className = 'active-order bid-order';
            
            const total = (parseFloat(order.price) * parseFloat(order.amount)).toFixed(4);
            
            orderDiv.innerHTML = `
                <span>${parseFloat(order.price).toFixed(2)}¢</span>
                <span>${parseFloat(order.amount).toFixed(2)}</span>
                <span>$${total}</span>
            `;
            
            bidsContainer.appendChild(orderDiv);
        });
        
        // 添加空白行填滿5行
        for (let i = sortedBids.length; i < 5; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-order bid-order';
            emptyDiv.innerHTML = `
                <span>--</span>
                <span>--</span>
                <span>--</span>
            `;
            bidsContainer.appendChild(emptyDiv);
        }
    }
    
    // 更新最後價格和價差
    if (lastPriceElement && spreadElement) {
        const bestBid = buyOrders.length > 0 ? Math.max(...buyOrders.map(o => parseFloat(o.price))) : 0;
        const bestAsk = sellOrders.length > 0 ? Math.min(...sellOrders.map(o => parseFloat(o.price))) : 0;
        
        if (bestBid > 0 || bestAsk > 0) {
            const lastPrice = bestBid > 0 ? bestBid : bestAsk;
            lastPriceElement.textContent = `${lastPrice.toFixed(2)}¢`;
            
            const spread = (bestAsk > 0 && bestBid > 0) ? (bestAsk - bestBid) : 0;
            spreadElement.textContent = `${spread.toFixed(2)}¢`;
        } else {
            lastPriceElement.textContent = '--';
            spreadElement.textContent = '--';
        }
    }
}

// 向後端提交訂單
async function placeOrderToBackend(): Promise<void> {
    // 如果沒有連接錢包，使用測試地址
    const testAddress = userAddress || '0x1234567890123456789012345678901234567890';
    
    try {
        const price = orderPrice?.value;
        const amount = orderAmount?.value;
        
        // 驗證數量
        if (!amount || parseFloat(amount) <= 0) {
            showError('請輸入有效的數量');
            return;
        }
        
        // 對於限價單，驗證價格
        if (currentTradeType === 'limit') {
            if (!price || parseFloat(price) <= 0) {
                showError('限價單請輸入有效的價格');
                return;
            }
            
            if (parseFloat(price) > 1) {
                showError('價格不能超過 1 ETH');
                return;
            }
        }
        
        const tradeTypeText = currentTradeType === 'limit' ? '限價' : '市價';
        showLoading(`提交 ${tradeTypeText}${currentOrderType === 'buy' ? '買入' : '賣出'} ${currentToken.toUpperCase()} 訂單...`);
        
        const orderData = {
            userAddress: testAddress,
            tokenType: currentToken,
            orderType: currentOrderType,
            tradeType: currentTradeType,
            price: currentTradeType === 'limit' ? price : undefined,
            amount: amount
        };
        
        const response = await fetch(`${BACKEND_URL}/api/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 清空表單
            if (orderPrice) orderPrice.value = '';
            if (orderAmount) orderAmount.value = '';
            
            // 清空市價單預估信息
            if (currentTradeType === 'market') {
                if (estimatedPrice) estimatedPrice.textContent = '-';
                if (estimatedAmount) estimatedAmount.textContent = '-';
                if (estimatedTotal) estimatedTotal.textContent = '-';
            }
            
            console.log('✅ 訂單提交成功:', result.data);
            
            // 刷新我的訂單列表
            await loadMyOrdersFromBackend();
            
            // 成功訊息會通過 WebSocket 接收
        } else {
            showError(`訂單提交失敗: ${result.message}`);
        }
        
    } catch (error) {
        console.error('❌ 向後端提交訂單失敗:', error);
        showError(`提交訂單失敗: ${(error as Error).message}`);
    }
}

// 從後端載入我的訂單
async function loadMyOrdersFromBackend(): Promise<void> {
    const testAddress = userAddress || '0x1234567890123456789012345678901234567890';
    if (!myOrdersList) return;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/orders/user/${testAddress}`);
        const result = await response.json();
        
        if (result.success) {
            const orders = result.data;
            
            myOrdersList.innerHTML = '<h4>我的訂單</h4>';
            
            if (orders.length === 0) {
                myOrdersList.innerHTML += '<p class="no-orders">暫無訂單</p>';
                return;
            }
            
            orders.forEach((order: any) => {
                const orderDiv = document.createElement('div');
                orderDiv.className = 'my-order-item';
                
                const tokenType = order.tokenType.toUpperCase();
                const orderTypeText = order.orderType === 'buy' ? '買入' : '賣出';
                const total = (parseFloat(order.price) * parseFloat(order.amount)).toFixed(4);
                const time = new Date(order.timestamp).toLocaleTimeString();
                
                const statusColor = order.status === 'pending' ? '#ff9800' : 
                                   order.status === 'matched' ? '#4CAF50' : '#f44336';
                const statusText = order.status === 'pending' ? '待撮合' : 
                                  order.status === 'matched' ? '已撮合' : '已取消';
                
                orderDiv.innerHTML = `
                    <div class="order-info">
                        <span class="token" style="font-weight: bold;">${orderTypeText} ${tokenType}</span>
                        <span class="price">價格: ${order.price} ETH</span>
                        <span class="amount">數量: ${order.amount}</span>
                        <span class="total">總額: ${total} ETH</span>
                        <span class="status" style="color: ${statusColor};">${statusText}</span>
                        <span class="time">${time}</span>
                        ${order.status === 'pending' ? 
                            `<button onclick="cancelBackendOrder('${order.id}')" class="cancel-btn">取消</button>` : 
                            ''}
                    </div>
                `;
                
                myOrdersList.appendChild(orderDiv);
            });
        }
        
    } catch (error) {
        console.error('❌ 載入我的訂單失敗:', error);
    }
}

// 取消後端訂單
async function cancelBackendOrder(orderId: string): Promise<void> {
    const testAddress = userAddress || '0x1234567890123456789012345678901234567890';
    
    try {
        showLoading('取消訂單中...');
        
        const response = await fetch(`${BACKEND_URL}/api/orders/${orderId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userAddress: testAddress })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ 訂單取消成功');
            await loadMyOrdersFromBackend();
            // 成功訊息會通過 WebSocket 接收
        } else {
            showError(`取消訂單失敗: ${result.message}`);
        }
        
    } catch (error) {
        console.error('❌ 取消訂單失敗:', error);
        showError(`取消訂單失敗: ${(error as Error).message}`);
    }
}

// 下單
async function placeOrder(): Promise<void> {
    // 這個函數已被 placeOrderToBackend 取代，保留以避免錯誤
    console.warn('placeOrder 函數已廢棄，請使用 placeOrderToBackend');
}

// 從後端載入訂單簿
async function loadOrderBookFromBackend(): Promise<void> {
    try {
        const yesResponse = await fetch(`${BACKEND_URL}/api/orderbook/yes`);
        const yesResult = await yesResponse.json();
        
        const noResponse = await fetch(`${BACKEND_URL}/api/orderbook/no`);
        const noResult = await noResponse.json();
        
        if (yesResult.success && noResult.success) {
            updateOrderBookDisplay({
                yes: yesResult.data,
                no: noResult.data
            });
        }
    } catch (error) {
        console.error('❌ 從後端載入訂單簿失敗:', error);
    }
}

// 從後端載入市場價格
async function loadMarketPricesFromBackend(): Promise<void> {
    try {
        const yesResponse = await fetch(`${BACKEND_URL}/api/market-price/yes`);
        const yesResult = await yesResponse.json();
        
        const noResponse = await fetch(`${BACKEND_URL}/api/market-price/no`);
        const noResult = await noResponse.json();
        
        if (yesResult.success && noResult.success) {
            const yesPrice = yesResult.data;
            const noPrice = noResult.data;
            
            if (yesMarketPrice) {
                const yesBestPrice = yesPrice.bestBuyPrice !== '0' ? yesPrice.bestBuyPrice : 
                                   yesPrice.bestSellPrice !== '0' ? yesPrice.bestSellPrice : '0';
                yesMarketPrice.textContent = `YES 最佳價格: ${yesBestPrice} ETH`;
            }
            
            if (noMarketPrice) {
                const noBestPrice = noPrice.bestBuyPrice !== '0' ? noPrice.bestBuyPrice : 
                                  noPrice.bestSellPrice !== '0' ? noPrice.bestSellPrice : '0';
                noMarketPrice.textContent = `NO 最佳價格: ${noBestPrice} ETH`;
            }
        }
    } catch (error) {
        console.error('❌ 從後端載入市場價格失敗:', error);
    }
}

// 載入訂單簿
async function loadOrderBook(): Promise<void> {
    // 這個函數已被 loadOrderBookFromBackend 取代
    console.warn('loadOrderBook 函數已廢棄，請使用 loadOrderBookFromBackend');
}

// 載入市場價格
async function loadMarketPrices(): Promise<void> {
    // 這個函數已被 loadMarketPricesFromBackend 取代
    console.warn('loadMarketPrices 函數已廢棄，請使用 loadMarketPricesFromBackend');
}

// 載入我的訂單
async function loadMyOrders(): Promise<void> {
    if (!orderBookContract || !userAddress || !myOrdersList) return;
    
    try {
        const myOrderIds = await orderBookContract.getUserOrders(userAddress);
        
        myOrdersList.innerHTML = '<h4>我的訂單</h4>';
        
        if (myOrderIds.length === 0) {
            myOrdersList.innerHTML += '<p>暫無訂單</p>';
            return;
        }
        
        for (const orderId of myOrderIds) {
            const orderDetails = await orderBookContract.getOrder(orderId);
            
            if (orderDetails.isActive) {
                const orderDiv = document.createElement('div');
                orderDiv.className = 'my-order-item';
                
                const tokenType = orderDetails.isYes ? 'YES' : 'NO';
                const price = ethers.formatEther(orderDetails.price);
                const amount = ethers.formatEther(orderDetails.amount);
                const time = new Date(Number(orderDetails.timestamp) * 1000).toLocaleTimeString();
                
                orderDiv.innerHTML = `
                    <div class="order-info">
                        <span class="token">${tokenType}</span>
                        <span class="price">價格: ${price} ETH</span>
                        <span class="amount">數量: ${amount}</span>
                        <span class="time">${time}</span>
                        <button onclick="cancelOrder(${orderId})" class="cancel-btn">取消</button>
                    </div>
                `;
                
                myOrdersList.appendChild(orderDiv);
            }
        }
        
    } catch (error) {
        console.error('❌ 載入我的訂單失敗:', error);
    }
}

// 取消訂單
async function cancelOrder(orderId: bigint): Promise<void> {
    if (!orderBookContract) {
        showError('請先連接錢包');
        return;
    }
    
    try {
        showLoading('取消訂單中...');
        
        const tx = await orderBookContract.cancelOrder(orderId);
        console.log('🔄 取消訂單交易已提交:', tx.hash);
        
        showLoading('等待交易確認...');
        const receipt = await tx.wait();
        console.log('✅ 取消訂單已確認:', receipt.hash);
        
        // 更新 UI
        await updateTokenBalances();
        await loadOrderBook();
        await loadMyOrders();
        
        showSuccess('訂單已成功取消！');
        
    } catch (error) {
        console.error('❌ 取消訂單失敗:', error);
        showError(`取消訂單失敗: ${(error as Error).message}`);
    }
}

// 顯示成功消息
function showSuccess(message: string): void {
    if (messageArea) messageArea.innerHTML = `<div class="alert alert-success">${message}</div>`;
    setTimeout(hideMessage, 5000);
}

// 顯示錯誤消息
function showError(message: string): void {
    if (messageArea) messageArea.innerHTML = `<div class="alert alert-error">${message}</div>`;
    setTimeout(hideMessage, 8000);
}

// 顯示載入消息
function showLoading(message: string): void {
    if (messageArea) messageArea.innerHTML = `<div class="alert alert-info">${message}</div>`;
}

// 隱藏消息
function hideMessage(): void {
    if (messageArea) messageArea.innerHTML = '';
}

// 將 cancelOrder 函數添加到全局作用域
(window as any).cancelOrder = cancelOrder;

// 將 cancelBackendOrder 函數添加到全局作用域
(window as any).cancelBackendOrder = cancelBackendOrder;

// 基本的初始化函數
async function init(): Promise<void> {
    console.log('🚀 初始化 Risk Market DApp...');
    
    setupEventListeners();
    
    if (typeof window.ethereum !== 'undefined') {
        console.log('✅ MetaMask 已安裝');
        await checkConnection();
    } else {
        console.log('⚠️ MetaMask 未安裝，使用測試模式');
        if (connectButton) {
            connectButton.textContent = 'MetaMask 未安裝 (測試模式)';
            connectButton.disabled = true;
        }
    }
    
    // 不管是否連接錢包都啟動後端連接和基礎功能
    await connectToBackend();
    await loadOrderBookFromBackend();
    await loadMarketPricesFromBackend();
    await loadMyOrdersFromBackend();
    
    // 初始化價格圖表
    initializePriceChart();
}

// === 價格圖表功能 ===
let priceChart: any = null;
let currentTimeRange = '24h';

// 初始化價格圖表
function initializePriceChart(): void {
    const canvas = document.getElementById('priceChart') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 創建圖表
    priceChart = new (window as any).Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'YES Token 價格',
                data: [],
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context: any) {
                            return `價格: ${context.parsed.y.toFixed(3)} ETH`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: '時間'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: '價格 (ETH)'
                    },
                    min: 0,
                    max: 1,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });

    // 設置時間範圍按鈕事件
    setupTimeRangeButtons();
    
    // 載入初始數據
    loadPriceHistory('yes', currentTimeRange);
    loadPriceStats('yes', currentTimeRange);
    
    // 每30秒更新一次
    setInterval(() => {
        loadPriceHistory('yes', currentTimeRange);
        loadPriceStats('yes', currentTimeRange);
    }, 30000);
}

// 設置時間範圍按鈕
function setupTimeRangeButtons(): void {
    const buttons = document.querySelectorAll('.time-range-btn');
    buttons.forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            const range = target.dataset.range;
            if (range) {
                setTimeRange(range);
            }
        });
    });
}

// 設置時間範圍
function setTimeRange(range: string): void {
    currentTimeRange = range;
    
    // 更新按鈕狀態
    const buttons = document.querySelectorAll('.time-range-btn');
    buttons.forEach(button => {
        button.classList.remove('active');
        if ((button as HTMLButtonElement).dataset.range === range) {
            button.classList.add('active');
        }
    });
    
    // 重新載入數據
    loadPriceHistory('yes', range);
    loadPriceStats('yes', range);
}

// 載入價格歷史數據
async function loadPriceHistory(tokenType: 'yes' | 'no', timeRange: string): Promise<void> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/price-history/${tokenType}?timeRange=${timeRange}`);
        const result = await response.json();
        
        if (result.success && priceChart) {
            const priceData = result.data;
            
            // 格式化時間標籤
            const labels = priceData.map((point: any) => {
                const date = new Date(point.timestamp);
                if (timeRange === '1h' || timeRange === '6h') {
                    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                } else if (timeRange === '24h') {
                    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                } else {
                    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
                }
            });
            
            const prices = priceData.map((point: any) => parseFloat(point.price));
            
            // 更新圖表數據
            priceChart.data.labels = labels;
            priceChart.data.datasets[0].data = prices;
            priceChart.update('none');
        }
    } catch (error) {
        console.error('載入價格歷史失敗:', error);
    }
}

// 載入價格統計數據
async function loadPriceStats(tokenType: 'yes' | 'no', timeRange: string): Promise<void> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/price-stats/${tokenType}?timeRange=${timeRange}`);
        const result = await response.json();
        
        if (result.success) {
            const stats = result.data;
            
            // 更新統計顯示
            updatePriceStatsDisplay(stats);
        }
    } catch (error) {
        console.error('載入價格統計失敗:', error);
    }
}

// 更新價格統計顯示
function updatePriceStatsDisplay(stats: any): void {
    const currentPriceElement = document.getElementById('currentPrice');
    const priceChange24hElement = document.getElementById('priceChange24h');
    const price24hHighElement = document.getElementById('price24hHigh');
    const price24hLowElement = document.getElementById('price24hLow');
    const volume24hElement = document.getElementById('volume24h');
    
    if (currentPriceElement) {
        currentPriceElement.textContent = `${stats.currentPrice} ETH`;
    }
    
    if (priceChange24hElement) {
        priceChange24hElement.textContent = `${stats.priceChange24h} (${stats.priceChangePercent24h})`;
        priceChange24hElement.className = 'price-stat-value';
        
        if (stats.priceChange24h.startsWith('+')) {
            priceChange24hElement.classList.add('price-change-positive');
        } else if (stats.priceChange24h.startsWith('-')) {
            priceChange24hElement.classList.add('price-change-negative');
        }
    }
    
    if (price24hHighElement) {
        price24hHighElement.textContent = `${stats.high24h} ETH`;
    }
    
    if (price24hLowElement) {
        price24hLowElement.textContent = `${stats.low24h} ETH`;
    }
    
    if (volume24hElement) {
        volume24hElement.textContent = `${stats.volume24h} Tokens`;
    }
}

// 啟動應用程式
document.addEventListener('DOMContentLoaded', init);
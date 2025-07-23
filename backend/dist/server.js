"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = __importStar(require("ws"));
const http_1 = __importDefault(require("http"));
const orderbook_1 = require("./orderbook");
class TradingEngine {
    constructor() {
        this.clients = new Map();
        this.app = (0, express_1.default)();
        this.server = http_1.default.createServer(this.app);
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        this.orderBook = new orderbook_1.OrderBook();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }
    setupMiddleware() {
        this.app.use((0, cors_1.default)());
        this.app.use(express_1.default.json());
    }
    setupRoutes() {
        // 下單 API
        this.app.post('/api/orders', (req, res) => {
            try {
                const { userAddress, tokenType, orderType, tradeType, price, amount } = req.body;
                // 驗證輸入
                if (!userAddress || !tokenType || !orderType || !tradeType || !amount) {
                    return res.status(400).json({
                        success: false,
                        message: '缺少必要的參數'
                    });
                }
                if (!['yes', 'no'].includes(tokenType)) {
                    return res.status(400).json({
                        success: false,
                        message: '無效的 token 類型'
                    });
                }
                if (!['buy', 'sell'].includes(orderType)) {
                    return res.status(400).json({
                        success: false,
                        message: '無效的訂單類型'
                    });
                }
                if (!['limit', 'market'].includes(tradeType)) {
                    return res.status(400).json({
                        success: false,
                        message: '無效的交易類型'
                    });
                }
                // 對於限價單，價格是必需的
                if (tradeType === 'limit' && (!price || parseFloat(price) <= 0)) {
                    return res.status(400).json({
                        success: false,
                        message: '限價單必須提供有效的價格'
                    });
                }
                if (parseFloat(amount) <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: '數量必須大於 0'
                    });
                }
                // 處理市價單和限價單
                let orderPrice = price || '0.5'; // 預設價格
                if (tradeType === 'market') {
                    // 市價單使用當前最佳價格
                    orderPrice = this.orderBook.processMarketOrder({
                        userAddress,
                        tokenType,
                        orderType,
                        tradeType,
                        price: '0', // 臨時價格，會被覆蓋
                        amount,
                        originalAmount: amount,
                        timestamp: Date.now(),
                        status: 'pending',
                        id: ''
                    });
                }
                // 新增訂單到訂單簿
                const order = this.orderBook.addOrder(userAddress, tokenType, orderType, tradeType, orderPrice, amount);
                // 嘗試撮合
                const matches = this.orderBook.matchOrders(order);
                // 通知所有客戶端訂單已提交
                this.broadcastMessage({
                    type: 'order_submitted',
                    data: {
                        order,
                        matches
                    }
                });
                // 如果有撮合成功，通知相關用戶
                if (matches.length > 0) {
                    matches.forEach(match => {
                        this.broadcastMessage({
                            type: 'order_matched',
                            data: match
                        });
                    });
                }
                // 廣播訂單簿更新
                this.broadcastOrderBookUpdate();
                res.json({
                    success: true,
                    data: {
                        order,
                        matches
                    },
                    message: matches.length > 0 ? `訂單已提交並撮合 ${matches.length} 筆交易` : '訂單已提交'
                });
            }
            catch (error) {
                console.error('下單失敗:', error);
                res.status(500).json({
                    success: false,
                    message: '伺服器錯誤'
                });
            }
        });
        // 取消訂單 API
        this.app.delete('/api/orders/:orderId', (req, res) => {
            try {
                const { orderId } = req.params;
                const { userAddress } = req.body;
                if (!userAddress) {
                    return res.status(400).json({
                        success: false,
                        message: '缺少用戶地址'
                    });
                }
                const success = this.orderBook.cancelOrder(orderId, userAddress);
                if (success) {
                    // 通知所有客戶端訂單已取消
                    this.broadcastMessage({
                        type: 'order_cancelled',
                        data: { orderId, userAddress }
                    });
                    // 廣播訂單簿更新
                    this.broadcastOrderBookUpdate();
                    res.json({
                        success: true,
                        message: '訂單已取消'
                    });
                }
                else {
                    res.status(404).json({
                        success: false,
                        message: '找不到訂單或無權限取消'
                    });
                }
            }
            catch (error) {
                console.error('取消訂單失敗:', error);
                res.status(500).json({
                    success: false,
                    message: '伺服器錯誤'
                });
            }
        });
        // 市價單預估 API
        this.app.post('/api/estimate-market-order', (req, res) => {
            try {
                const { tokenType, orderType, amount } = req.body;
                // 驗證輸入
                if (!tokenType || !orderType || !amount) {
                    return res.status(400).json({
                        success: false,
                        message: '缺少必要的參數'
                    });
                }
                if (!['yes', 'no'].includes(tokenType)) {
                    return res.status(400).json({
                        success: false,
                        message: '無效的 token 類型'
                    });
                }
                if (!['buy', 'sell'].includes(orderType)) {
                    return res.status(400).json({
                        success: false,
                        message: '無效的訂單類型'
                    });
                }
                if (parseFloat(amount) <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: '數量必須大於 0'
                    });
                }
                // 預估市價單執行結果
                const estimate = this.orderBook.estimateMarketOrder(tokenType, orderType, amount);
                res.json({
                    success: true,
                    data: estimate
                });
            }
            catch (error) {
                console.error('預估市價單失敗:', error);
                res.status(500).json({
                    success: false,
                    message: '伺服器錯誤'
                });
            }
        });
        // 獲取訂單簿 API
        this.app.get('/api/orderbook/:tokenType', (req, res) => {
            try {
                const { tokenType } = req.params;
                if (!['yes', 'no'].includes(tokenType)) {
                    return res.status(400).json({
                        success: false,
                        message: '無效的 token 類型'
                    });
                }
                const orderBook = this.orderBook.getOrderBook(tokenType);
                res.json({
                    success: true,
                    data: orderBook
                });
            }
            catch (error) {
                console.error('獲取訂單簿失敗:', error);
                res.status(500).json({
                    success: false,
                    message: '伺服器錯誤'
                });
            }
        });
        // 獲取用戶訂單 API
        this.app.get('/api/orders/user/:userAddress', (req, res) => {
            try {
                const { userAddress } = req.params;
                const orders = this.orderBook.getUserOrders(userAddress);
                res.json({
                    success: true,
                    data: orders
                });
            }
            catch (error) {
                console.error('獲取用戶訂單失敗:', error);
                res.status(500).json({
                    success: false,
                    message: '伺服器錯誤'
                });
            }
        });
        // 獲取市場價格 API
        this.app.get('/api/market-price/:tokenType', (req, res) => {
            try {
                const { tokenType } = req.params;
                if (!['yes', 'no'].includes(tokenType)) {
                    return res.status(400).json({
                        success: false,
                        message: '無效的 token 類型'
                    });
                }
                const marketPrice = this.orderBook.getMarketPrice(tokenType);
                res.json({
                    success: true,
                    data: marketPrice
                });
            }
            catch (error) {
                console.error('獲取市場價格失敗:', error);
                res.status(500).json({
                    success: false,
                    message: '伺服器錯誤'
                });
            }
        });
        // 獲取價格歷史數據 API
        this.app.get('/api/price-history/:tokenType', (req, res) => {
            try {
                const { tokenType } = req.params;
                const { timeRange = '24h' } = req.query;
                if (tokenType !== 'yes' && tokenType !== 'no') {
                    return res.status(400).json({
                        success: false,
                        message: '無效的代幣類型'
                    });
                }
                const priceHistory = this.orderBook.getPriceHistory(tokenType, timeRange);
                res.json({
                    success: true,
                    data: priceHistory
                });
            }
            catch (error) {
                console.error('獲取價格歷史失敗:', error);
                res.status(500).json({
                    success: false,
                    message: '獲取價格歷史失敗'
                });
            }
        });
        // 獲取價格統計數據 API
        this.app.get('/api/price-stats/:tokenType', (req, res) => {
            try {
                const { tokenType } = req.params;
                const { timeRange = '24h' } = req.query;
                if (tokenType !== 'yes' && tokenType !== 'no') {
                    return res.status(400).json({
                        success: false,
                        message: '無效的代幣類型'
                    });
                }
                const priceStats = this.orderBook.getPriceStats(tokenType, timeRange);
                res.json({
                    success: true,
                    data: priceStats
                });
            }
            catch (error) {
                console.error('獲取價格統計失敗:', error);
                res.status(500).json({
                    success: false,
                    message: '獲取價格統計失敗'
                });
            }
        });
        // 健康檢查 API
        this.app.get('/api/health', (req, res) => {
            res.json({
                success: true,
                message: '交易引擎運行正常',
                timestamp: new Date().toISOString()
            });
        });
    }
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            this.clients.set(clientId, ws);
            console.log(`客戶端 ${clientId} 已連接，當前連接數: ${this.clients.size}`);
            // 發送歡迎訊息
            ws.send(JSON.stringify({
                type: 'connected',
                data: { clientId }
            }));
            // 發送當前訂單簿狀態
            const yesOrderBook = this.orderBook.getOrderBook('yes');
            const noOrderBook = this.orderBook.getOrderBook('no');
            ws.send(JSON.stringify({
                type: 'orderbook_update',
                data: {
                    yes: yesOrderBook,
                    no: noOrderBook
                }
            }));
            // 處理客戶端斷開連接
            ws.on('close', () => {
                this.clients.delete(clientId);
                console.log(`客戶端 ${clientId} 已斷開連接，當前連接數: ${this.clients.size}`);
            });
            // 處理客戶端錯誤
            ws.on('error', (error) => {
                console.error(`客戶端 ${clientId} 錯誤:`, error);
                this.clients.delete(clientId);
            });
        });
    }
    broadcastMessage(message) {
        const messageStr = JSON.stringify(message);
        this.clients.forEach((ws, clientId) => {
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(messageStr);
            }
            else {
                this.clients.delete(clientId);
            }
        });
    }
    broadcastOrderBookUpdate() {
        const yesOrderBook = this.orderBook.getOrderBook('yes');
        const noOrderBook = this.orderBook.getOrderBook('no');
        this.broadcastMessage({
            type: 'orderbook_update',
            data: {
                yes: yesOrderBook,
                no: noOrderBook
            }
        });
    }
    generateClientId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    start(port = 3001) {
        this.server.listen(port, () => {
            console.log(`🚀 交易引擎服務器啟動在 http://localhost:${port}`);
            console.log(`📡 WebSocket 服務器啟動在 ws://localhost:${port}`);
        });
    }
}
// 啟動服務器
const engine = new TradingEngine();
engine.start(3001);

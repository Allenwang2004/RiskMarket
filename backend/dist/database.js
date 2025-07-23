"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseManager = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
class DatabaseManager {
    constructor(dbPath = 'risk_market.db') {
        // 確保資料庫檔案在 backend 目錄下
        const fullPath = path_1.default.resolve(process.cwd(), dbPath);
        this.db = new better_sqlite3_1.default(fullPath);
        console.log(`📊 資料庫連接成功: ${fullPath}`);
        this.initializeTables();
    }
    // 初始化資料表
    initializeTables() {
        // 創建訂單表
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_address TEXT NOT NULL,
        token_type TEXT NOT NULL CHECK (token_type IN ('yes', 'no')),
        order_type TEXT NOT NULL CHECK (order_type IN ('buy', 'sell')),
        trade_type TEXT NOT NULL CHECK (trade_type IN ('limit', 'market')),
        price TEXT NOT NULL,
        amount TEXT NOT NULL,
        original_amount TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'matched', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // 創建配對表
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buy_order_id TEXT NOT NULL,
        sell_order_id TEXT NOT NULL,
        matched_price TEXT NOT NULL,
        matched_amount TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (buy_order_id) REFERENCES orders (id),
        FOREIGN KEY (sell_order_id) REFERENCES orders (id)
      )
    `);
        // 創建索引以提高查詢效能
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_token_type_order_type_status 
      ON orders (token_type, order_type, status)
    `);
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_user_address 
      ON orders (user_address)
    `);
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_timestamp 
      ON orders (timestamp)
    `);
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_matches_timestamp 
      ON matches (timestamp)
    `);
        console.log('✅ 資料表初始化完成');
    }
    // 插入新訂單
    insertOrder(order) {
        const stmt = this.db.prepare(`
      INSERT INTO orders (
        id, user_address, token_type, order_type, trade_type, price, amount, original_amount, timestamp, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(order.id, order.userAddress, order.tokenType, order.orderType, order.tradeType, order.price, order.amount, order.originalAmount, order.timestamp, order.status);
    }
    // 更新訂單
    updateOrder(orderId, updates) {
        const setClause = Object.keys(updates)
            .map(key => `${this.camelToSnake(key)} = ?`)
            .join(', ');
        if (!setClause)
            return false;
        const stmt = this.db.prepare(`
      UPDATE orders 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
        const values = Object.values(updates);
        values.push(orderId);
        const result = stmt.run(...values);
        return result.changes > 0;
    }
    // 駝峰命名轉下劃線
    camelToSnake(str) {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }
    // 資料庫行轉換為 Order 物件
    rowToOrder(row) {
        return {
            id: row.id,
            userAddress: row.user_address,
            tokenType: row.token_type,
            orderType: row.order_type,
            tradeType: row.trade_type,
            price: row.price,
            amount: row.amount,
            originalAmount: row.original_amount,
            timestamp: row.timestamp,
            status: row.status
        };
    }
    // 獲取單一訂單
    getOrder(orderId) {
        const stmt = this.db.prepare('SELECT * FROM orders WHERE id = ?');
        const row = stmt.get(orderId);
        return row ? this.rowToOrder(row) : null;
    }
    // 獲取用戶訂單
    getUserOrders(userAddress) {
        const stmt = this.db.prepare(`
      SELECT * FROM orders 
      WHERE user_address = ? AND status = 'pending'
      ORDER BY timestamp DESC
    `);
        const rows = stmt.all(userAddress);
        return rows.map(row => this.rowToOrder(row));
    }
    // 獲取活躍訂單 (pending 狀態)
    getActiveOrders(tokenType, orderType) {
        let query = `
      SELECT * FROM orders 
      WHERE token_type = ? AND status = 'pending'
    `;
        const params = [tokenType];
        if (orderType) {
            query += ' AND order_type = ?';
            params.push(orderType);
        }
        // 買單按價格從高到低排序，賣單按價格從低到高排序，都按時間優先
        if (orderType === 'buy') {
            query += ' ORDER BY CAST(price AS REAL) DESC, timestamp ASC';
        }
        else if (orderType === 'sell') {
            query += ' ORDER BY CAST(price AS REAL) ASC, timestamp ASC';
        }
        else {
            query += ' ORDER BY timestamp ASC';
        }
        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params);
        return rows.map(row => this.rowToOrder(row));
    }
    // 插入配對紀錄
    insertMatch(match) {
        const stmt = this.db.prepare(`
      INSERT INTO matches (
        buy_order_id, sell_order_id, matched_price, matched_amount, timestamp
      ) VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(match.buyOrder.id, match.sellOrder.id, match.matchedPrice, match.matchedAmount, match.timestamp);
    }
    // 獲取交易歷史
    getMatches(limit = 100) {
        const stmt = this.db.prepare(`
      SELECT 
        m.*,
        bo.id as buy_order_id,
        bo.user_address as buy_user_address,
        bo.token_type as buy_token_type,
        bo.order_type as buy_order_type,
        bo.trade_type as buy_trade_type,
        bo.price as buy_price,
        bo.amount as buy_amount,
        bo.original_amount as buy_original_amount,
        bo.timestamp as buy_timestamp,
        bo.status as buy_status,
        so.id as sell_order_id,
        so.user_address as sell_user_address,
        so.token_type as sell_token_type,
        so.order_type as sell_order_type,
        so.trade_type as sell_trade_type,
        so.price as sell_price,
        so.amount as sell_amount,
        so.original_amount as sell_original_amount,
        so.timestamp as sell_timestamp,
        so.status as sell_status
      FROM matches m
      JOIN orders bo ON m.buy_order_id = bo.id
      JOIN orders so ON m.sell_order_id = so.id
      ORDER BY m.timestamp DESC
      LIMIT ?
    `);
        const rows = stmt.all(limit);
        return rows.map((row) => ({
            buyOrder: {
                id: row.buy_order_id,
                userAddress: row.buy_user_address,
                tokenType: row.buy_token_type,
                orderType: row.buy_order_type,
                tradeType: row.buy_trade_type,
                price: row.buy_price,
                amount: row.buy_amount,
                originalAmount: row.buy_original_amount,
                timestamp: row.buy_timestamp,
                status: row.buy_status
            },
            sellOrder: {
                id: row.sell_order_id,
                userAddress: row.sell_user_address,
                tokenType: row.sell_token_type,
                orderType: row.sell_order_type,
                tradeType: row.sell_trade_type,
                price: row.sell_price,
                amount: row.sell_amount,
                originalAmount: row.sell_original_amount,
                timestamp: row.sell_timestamp,
                status: row.sell_status
            },
            matchedPrice: row.matched_price,
            matchedAmount: row.matched_amount,
            timestamp: row.timestamp
        }));
    }
    // 取消訂單
    cancelOrder(orderId, userAddress) {
        const stmt = this.db.prepare(`
      UPDATE orders 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_address = ? AND status = 'pending'
    `);
        const result = stmt.run(orderId, userAddress);
        return result.changes > 0;
    }
    // 獲取市場統計
    getMarketStats(tokenType) {
        const buyOrdersStmt = this.db.prepare(`
      SELECT COUNT(*) as count, COALESCE(MAX(CAST(price AS REAL)), 0) as best_price
      FROM orders 
      WHERE token_type = ? AND order_type = 'buy' AND status = 'pending'
    `);
        const sellOrdersStmt = this.db.prepare(`
      SELECT COUNT(*) as count, COALESCE(MIN(CAST(price AS REAL)), 0) as best_price
      FROM orders 
      WHERE token_type = ? AND order_type = 'sell' AND status = 'pending'
    `);
        const buyStats = buyOrdersStmt.get(tokenType);
        const sellStats = sellOrdersStmt.get(tokenType);
        return {
            bestBuyPrice: buyStats.best_price.toString(),
            bestSellPrice: sellStats.best_price.toString(),
            buyOrderCount: buyStats.count,
            sellOrderCount: sellStats.count,
            spread: sellStats.best_price > 0 && buyStats.best_price > 0
                ? (sellStats.best_price - buyStats.best_price).toString()
                : '0'
        };
    }
    // 獲取價格歷史數據
    getPriceHistory(tokenType, timeRange) {
        let hours = 24; // 預設 24 小時
        switch (timeRange) {
            case '1h':
                hours = 1;
                break;
            case '6h':
                hours = 6;
                break;
            case '24h':
                hours = 24;
                break;
            case '7d':
                hours = 24 * 7;
                break;
            default:
                hours = 24;
        }
        // 取得指定時間範圍內的所有成交記錄
        const stmt = this.db.prepare(`
      SELECT 
        matched_price as price,
        matched_amount as amount,
        m.timestamp,
        strftime('%Y-%m-%d %H:00:00', datetime(m.timestamp/1000, 'unixepoch')) as hour_group
      FROM matches m
      JOIN orders bo ON m.buy_order_id = bo.id
      WHERE bo.token_type = ? 
        AND m.timestamp >= ?
      ORDER BY m.timestamp ASC
    `);
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        const matches = stmt.all(tokenType, cutoffTime);
        if (matches.length === 0) {
            // 如果沒有歷史數據，返回一些模擬數據點
            const basePrice = 0.5; // 基礎價格
            const points = [];
            const now = Date.now();
            const intervalMs = (hours * 60 * 60 * 1000) / 20; // 20 個數據點
            for (let i = 19; i >= 0; i--) {
                const timestamp = now - (i * intervalMs);
                const variation = (Math.random() - 0.5) * 0.1; // ±5% 的隨機變化
                const price = Math.max(0.1, Math.min(0.9, basePrice + variation));
                points.push({
                    timestamp,
                    price: price.toFixed(3),
                    volume: (Math.random() * 100 + 10).toFixed(1),
                    hour_group: new Date(timestamp).toISOString().slice(0, 13) + ':00:00'
                });
            }
            return points;
        }
        // 將數據按小時分組並計算 OHLC 數據
        const groupedData = new Map();
        matches.forEach((match) => {
            const hour = match.hour_group;
            if (!groupedData.has(hour)) {
                groupedData.set(hour, {
                    timestamp: new Date(hour).getTime(),
                    prices: [],
                    volume: 0
                });
            }
            const group = groupedData.get(hour);
            group.prices.push(parseFloat(match.price));
            group.volume += parseFloat(match.amount);
        });
        // 轉換為價格歷史點
        const priceHistory = [];
        groupedData.forEach((data, hour) => {
            const prices = data.prices.sort((a, b) => a - b);
            priceHistory.push({
                timestamp: data.timestamp,
                price: prices[prices.length - 1].toFixed(3), // 使用最後價格作為收盤價
                volume: data.volume.toFixed(1),
                hour_group: hour
            });
        });
        return priceHistory.sort((a, b) => a.timestamp - b.timestamp);
    }
    // 獲取價格統計數據
    getPriceStats(tokenType, timeRange = '24h') {
        let hours = 24;
        switch (timeRange) {
            case '1h':
                hours = 1;
                break;
            case '6h':
                hours = 6;
                break;
            case '24h':
                hours = 24;
                break;
            case '7d':
                hours = 24 * 7;
                break;
        }
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as trade_count,
        SUM(CAST(matched_amount AS REAL)) as total_volume,
        AVG(CAST(matched_price AS REAL)) as avg_price,
        MIN(CAST(matched_price AS REAL)) as low_price,
        MAX(CAST(matched_price AS REAL)) as high_price,
        (SELECT matched_price FROM matches m2 
         JOIN orders bo2 ON m2.buy_order_id = bo2.id 
         WHERE bo2.token_type = ? AND m2.timestamp >= ? 
         ORDER BY m2.timestamp ASC LIMIT 1) as first_price,
        (SELECT matched_price FROM matches m3 
         JOIN orders bo3 ON m3.buy_order_id = bo3.id 
         WHERE bo3.token_type = ? AND m3.timestamp >= ? 
         ORDER BY m3.timestamp DESC LIMIT 1) as last_price
      FROM matches m
      JOIN orders bo ON m.buy_order_id = bo.id
      WHERE bo.token_type = ? AND m.timestamp >= ?
    `);
        const stats = stmt.get(tokenType, cutoffTime, tokenType, cutoffTime, tokenType, cutoffTime);
        if (!stats || stats.trade_count === 0) {
            return {
                currentPrice: '0.500',
                priceChange24h: '0.000',
                priceChangePercent24h: '0.00',
                high24h: '0.500',
                low24h: '0.500',
                volume24h: '0.0',
                tradeCount: 0
            };
        }
        const currentPrice = parseFloat(stats.last_price || '0.5');
        const firstPrice = parseFloat(stats.first_price || currentPrice);
        const priceChange = currentPrice - firstPrice;
        const priceChangePercent = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;
        return {
            currentPrice: currentPrice.toFixed(3),
            priceChange24h: priceChange >= 0 ? `+${priceChange.toFixed(3)}` : priceChange.toFixed(3),
            priceChangePercent24h: priceChangePercent >= 0 ? `+${priceChangePercent.toFixed(2)}%` : `${priceChangePercent.toFixed(2)}%`,
            high24h: (stats.high_price || 0.5).toFixed(3),
            low24h: (stats.low_price || 0.5).toFixed(3),
            volume24h: (stats.total_volume || 0).toFixed(1),
            tradeCount: stats.trade_count || 0
        };
    }
    // 關閉資料庫連接
    close() {
        this.db.close();
        console.log('📊 資料庫連接已關閉');
    }
    // 清空所有資料 (僅用於測試)
    clearAllData() {
        this.db.exec('DELETE FROM matches');
        this.db.exec('DELETE FROM orders');
        console.log('🗑️ 所有資料已清空');
    }
}
exports.DatabaseManager = DatabaseManager;

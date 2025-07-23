import { Order, MatchResult } from './types';
import { DatabaseManager } from './database';

// 簡單的 UUID 生成函數
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export class OrderBook {
  private db: DatabaseManager;

  constructor() {
    this.db = new DatabaseManager();
  }

  // 新增訂單並嘗試撮合
  addOrder(userAddress: string, tokenType: 'yes' | 'no', orderType: 'buy' | 'sell', tradeType: 'limit' | 'market', price: string, amount: string): Order {
    const order: Order = {
      id: generateUUID(),
      userAddress,
      tokenType,
      orderType,
      tradeType,
      price,
      amount,
      originalAmount: amount, // 記錄原始下單數量
      timestamp: Date.now(),
      status: 'pending'
    };

    // 儲存到資料庫
    this.db.insertOrder(order);

    return order;
  }

  // 嘗試撮合訂單
  matchOrders(newOrder: Order): MatchResult[] {
    const matches: MatchResult[] = [];
    
    if (newOrder.orderType === 'buy') {
      // 新買單與現有賣單撮合
      const sellOrders = this.db.getActiveOrders(newOrder.tokenType, 'sell');
      let remainingAmount = parseFloat(newOrder.amount);

      for (const sellOrder of sellOrders) {
        if (remainingAmount <= 0) break;
        
        // 檢查是否可以撮合（買單價格 >= 賣單價格）
        if (parseFloat(newOrder.price) >= parseFloat(sellOrder.price)) {
          const matchAmount = Math.min(remainingAmount, parseFloat(sellOrder.amount));
          const matchPrice = sellOrder.price; // 使用賣單價格作為成交價

          // 創建撮合結果
          const match: MatchResult = {
            buyOrder: newOrder,
            sellOrder,
            matchedPrice: matchPrice,
            matchedAmount: matchAmount.toString(),
            timestamp: Date.now()
          };
          matches.push(match);

          // 記錄到資料庫
          this.db.insertMatch(match);

          // 更新訂單狀態
          remainingAmount -= matchAmount;
          const sellOrderRemaining = parseFloat(sellOrder.amount) - matchAmount;

          if (sellOrderRemaining <= 0) {
            this.db.updateOrder(sellOrder.id, { status: 'matched', amount: '0' });
          } else {
            this.db.updateOrder(sellOrder.id, { amount: sellOrderRemaining.toString() });
          }
        }
      }

      // 更新新買單的剩餘數量
      if (remainingAmount <= 0) {
        this.db.updateOrder(newOrder.id, { status: 'matched', amount: '0' });
      } else {
        this.db.updateOrder(newOrder.id, { amount: remainingAmount.toString() });
      }

    } else {
      // 新賣單與現有買單撮合
      const buyOrders = this.db.getActiveOrders(newOrder.tokenType, 'buy');
      let remainingAmount = parseFloat(newOrder.amount);

      for (const buyOrder of buyOrders) {
        if (remainingAmount <= 0) break;
        
        // 檢查是否可以撮合（買單價格 >= 賣單價格）
        if (parseFloat(buyOrder.price) >= parseFloat(newOrder.price)) {
          const matchAmount = Math.min(remainingAmount, parseFloat(buyOrder.amount));
          const matchPrice = newOrder.price; // 使用賣單價格作為成交價

          // 創建撮合結果
          const match: MatchResult = {
            buyOrder,
            sellOrder: newOrder,
            matchedPrice: matchPrice,
            matchedAmount: matchAmount.toString(),
            timestamp: Date.now()
          };
          matches.push(match);

          // 記錄到資料庫
          this.db.insertMatch(match);

          // 更新訂單狀態
          remainingAmount -= matchAmount;
          const buyOrderRemaining = parseFloat(buyOrder.amount) - matchAmount;

          if (buyOrderRemaining <= 0) {
            this.db.updateOrder(buyOrder.id, { status: 'matched', amount: '0' });
          } else {
            this.db.updateOrder(buyOrder.id, { amount: buyOrderRemaining.toString() });
          }
        }
      }

      // 更新新賣單的剩餘數量
      if (remainingAmount <= 0) {
        this.db.updateOrder(newOrder.id, { status: 'matched', amount: '0' });
      } else {
        this.db.updateOrder(newOrder.id, { amount: remainingAmount.toString() });
      }
    }

    return matches;
  }

  // 取消訂單
  cancelOrder(orderId: string, userAddress: string): boolean {
    return this.db.cancelOrder(orderId, userAddress);
  }

  // 獲取訂單簿數據
  getOrderBook(tokenType: 'yes' | 'no') {
    const buyOrders = this.db.getActiveOrders(tokenType, 'buy');
    const sellOrders = this.db.getActiveOrders(tokenType, 'sell');
    
    return {
      buyOrders: buyOrders.map(order => ({
        id: order.id,
        price: order.price,
        amount: order.amount,
        timestamp: order.timestamp
      })),
      sellOrders: sellOrders.map(order => ({
        id: order.id,
        price: order.price,
        amount: order.amount,
        timestamp: order.timestamp
      }))
    };
  }

  // 獲取用戶訂單
  getUserOrders(userAddress: string): Order[] {
    return this.db.getUserOrders(userAddress);
  }

  // 獲取訂單詳情
  getOrder(orderId: string): Order | undefined {
    const order = this.db.getOrder(orderId);
    return order || undefined;
  }

  // 獲取市場價格（最佳買賣價）
  getMarketPrice(tokenType: 'yes' | 'no') {
    return this.db.getMarketStats(tokenType);
  }

  // 關閉資料庫連接
  close(): void {
    this.db.close();
  }

  // 清空所有資料 (僅用於測試)
  clearAllData(): void {
    this.db.clearAllData();
  }

  // 獲取價格歷史數據
  getPriceHistory(tokenType: 'yes' | 'no', timeRange: string): any[] {
    return this.db.getPriceHistory(tokenType, timeRange);
  }

  // 獲取價格統計數據
  getPriceStats(tokenType: 'yes' | 'no', timeRange: string = '24h'): any {
    return this.db.getPriceStats(tokenType, timeRange);
  }

  // 預估市價單執行結果
  estimateMarketOrder(tokenType: 'yes' | 'no', orderType: 'buy' | 'sell', amount: string): any {
    const targetAmount = parseFloat(amount);
    if (targetAmount <= 0) {
      return {
        estimatedPrice: '0',
        estimatedAmount: '0',
        estimatedTotal: '0',
        availableLiquidity: '0'
      };
    }

    // 獲取對手方訂單（買單對應賣單，賣單對應買單）
    const oppositeOrderType = orderType === 'buy' ? 'sell' : 'buy';
    const availableOrders = this.db.getActiveOrders(tokenType, oppositeOrderType);

    if (availableOrders.length === 0) {
      return {
        estimatedPrice: '0',
        estimatedAmount: '0',
        estimatedTotal: '0',
        availableLiquidity: '0'
      };
    }

    let remainingAmount = targetAmount;
    let totalCost = 0;
    let totalAmount = 0;
    let availableLiquidity = 0;

    // 計算所有可用流動性
    for (const order of availableOrders) {
      availableLiquidity += parseFloat(order.amount);
    }

    // 模擬執行市價單
    for (const order of availableOrders) {
      if (remainingAmount <= 0) break;

      const orderAmount = parseFloat(order.amount);
      const orderPrice = parseFloat(order.price);
      const matchAmount = Math.min(remainingAmount, orderAmount);

      totalAmount += matchAmount;
      totalCost += matchAmount * orderPrice;
      remainingAmount -= matchAmount;
    }

    // 計算平均執行價格
    const avgPrice = totalAmount > 0 ? totalCost / totalAmount : 0;

    return {
      estimatedPrice: avgPrice.toFixed(3),
      estimatedAmount: totalAmount.toFixed(3),
      estimatedTotal: totalCost.toFixed(3),
      availableLiquidity: availableLiquidity.toFixed(3)
    };
  }

  // 處理市價單 - 以當前最佳價格執行
  processMarketOrder(order: Order): string {
    const oppositeOrderType = order.orderType === 'buy' ? 'sell' : 'buy';
    const availableOrders = this.db.getActiveOrders(order.tokenType, oppositeOrderType);

    if (availableOrders.length === 0) {
      // 沒有對手方訂單，使用預設價格
      return '0.5';
    }

    // 使用最佳價格
    const bestOrder = availableOrders[0];
    return bestOrder.price;
  }
}

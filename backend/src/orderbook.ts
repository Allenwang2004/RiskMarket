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
    let remainingAmount = parseFloat(newOrder.amount);

    // 1. 嘗試 Direct Match（同 tokenType 的對手訂單）
    remainingAmount = this.tryDirectMatch(newOrder, remainingAmount, matches);

    // 2. 若為 Buy，嘗試 Minting（另一邊 Buy 且價格加總 ≥ 1）
    if (newOrder.orderType === 'buy' && remainingAmount > 0) {
      remainingAmount = this.tryMinting(newOrder, remainingAmount, matches);
    }

    // 3. 若為 Sell，嘗試 Merge（另一邊 Sell 且價格加總 ≥ 1）
    if (newOrder.orderType === 'sell' && remainingAmount > 0) {
      remainingAmount = this.tryMerge(newOrder, remainingAmount, matches);
    }

    // 4. 若仍未完全成交，更新為部分成交或留在 OrderBook
    if (remainingAmount <= 0) {
      this.db.updateOrder(newOrder.id, { status: 'matched', amount: '0' });
    } else {
      this.db.updateOrder(newOrder.id, { amount: remainingAmount.toString() });
    }

    return matches;
  }

  // Direct Match（直接撮合）- 同 tokenType 的對手訂單
  private tryDirectMatch(newOrder: Order, remainingAmount: number, matches: MatchResult[]): number {
    const oppositeOrderType = newOrder.orderType === 'buy' ? 'sell' : 'buy';
    const oppositeOrders = this.db.getActiveOrders(newOrder.tokenType, oppositeOrderType);

    for (const oppositeOrder of oppositeOrders) {
      if (remainingAmount <= 0) break;
      
      // 檢查是否可以撮合（買單價格 >= 賣單價格）
      const canMatch = newOrder.orderType === 'buy' 
        ? parseFloat(newOrder.price) >= parseFloat(oppositeOrder.price)
        : parseFloat(oppositeOrder.price) >= parseFloat(newOrder.price);

      if (canMatch) {
        const matchAmount = Math.min(remainingAmount, parseFloat(oppositeOrder.amount));
        
        // 成交價格使用「對手方」價格（即賣單價格）
        const matchPrice = newOrder.orderType === 'buy' 
          ? oppositeOrder.price 
          : newOrder.price;

        // 創建撮合結果
        const match: MatchResult = {
          type: 'direct',
          buyOrder: newOrder.orderType === 'buy' ? newOrder : oppositeOrder,
          sellOrder: newOrder.orderType === 'sell' ? newOrder : oppositeOrder,
          matchedPrice: matchPrice,
          matchedAmount: matchAmount.toString(),
          timestamp: Date.now()
        };
        matches.push(match);

        // 記錄到資料庫
        this.db.insertMatch(match);

        // 更新訂單狀態
        remainingAmount -= matchAmount;
        const oppositeRemaining = parseFloat(oppositeOrder.amount) - matchAmount;

        if (oppositeRemaining <= 0) {
          this.db.updateOrder(oppositeOrder.id, { status: 'matched', amount: '0' });
        } else {
          this.db.updateOrder(oppositeOrder.id, { amount: oppositeRemaining.toString() });
        }
      }
    }

    return remainingAmount;
  }

  // Minting（鑄造新 share）- 兩筆買單：買 YES + 買 NO，價格加總 ≥ 1
  private tryMinting(newOrder: Order, remainingAmount: number, matches: MatchResult[]): number {
    const oppositeTokenType = newOrder.tokenType === 'yes' ? 'no' : 'yes';
    const oppositeBuyOrders = this.db.getActiveOrders(oppositeTokenType, 'buy');

    for (const oppositeBuyOrder of oppositeBuyOrders) {
      if (remainingAmount <= 0) break;
      
      // 檢查價格加總是否 ≥ 1
      const priceSum = parseFloat(newOrder.price) + parseFloat(oppositeBuyOrder.price);
      if (priceSum >= 1.0) {
        const matchAmount = Math.min(remainingAmount, parseFloat(oppositeBuyOrder.amount));

        // 創建撮合結果 - 沒有成交價格（因為是創造新 share）
        const match: MatchResult = {
          type: 'minting',
          buyOrder: newOrder.tokenType === 'yes' ? newOrder : oppositeBuyOrder,
          sellOrder: newOrder.tokenType === 'no' ? newOrder : oppositeBuyOrder, // 這裡用 sellOrder 來存另一個買單
          matchedAmount: matchAmount.toString(),
          timestamp: Date.now()
        };
        matches.push(match);

        // 記錄到資料庫
        this.db.insertMatch(match);

        // 更新訂單狀態
        remainingAmount -= matchAmount;
        const oppositeRemaining = parseFloat(oppositeBuyOrder.amount) - matchAmount;

        if (oppositeRemaining <= 0) {
          this.db.updateOrder(oppositeBuyOrder.id, { status: 'matched', amount: '0' });
        } else {
          this.db.updateOrder(oppositeBuyOrder.id, { amount: oppositeRemaining.toString() });
        }
      }
    }

    return remainingAmount;
  }

  // Merge（銷毀 share）- 兩筆賣單：賣 YES + 賣 NO，價格加總 ≥ 1
  private tryMerge(newOrder: Order, remainingAmount: number, matches: MatchResult[]): number {
    const oppositeTokenType = newOrder.tokenType === 'yes' ? 'no' : 'yes';
    const oppositeSellOrders = this.db.getActiveOrders(oppositeTokenType, 'sell');

    for (const oppositeSellOrder of oppositeSellOrders) {
      if (remainingAmount <= 0) break;
      
      // 檢查價格加總是否 ≥ 1
      const priceSum = parseFloat(newOrder.price) + parseFloat(oppositeSellOrder.price);
      if (priceSum >= 1.0) {
        const matchAmount = Math.min(remainingAmount, parseFloat(oppositeSellOrder.amount));

        // 創建撮合結果 - 沒有成交價格（因為是 share 合併）
        const match: MatchResult = {
          type: 'merge',
          buyOrder: newOrder.tokenType === 'yes' ? newOrder : oppositeSellOrder, // 這裡用 buyOrder 來存一個賣單
          sellOrder: newOrder.tokenType === 'no' ? newOrder : oppositeSellOrder,
          matchedAmount: matchAmount.toString(),
          timestamp: Date.now()
        };
        matches.push(match);

        // 記錄到資料庫
        this.db.insertMatch(match);

        // 更新訂單狀態
        remainingAmount -= matchAmount;
        const oppositeRemaining = parseFloat(oppositeSellOrder.amount) - matchAmount;

        if (oppositeRemaining <= 0) {
          this.db.updateOrder(oppositeSellOrder.id, { status: 'matched', amount: '0' });
        } else {
          this.db.updateOrder(oppositeSellOrder.id, { amount: oppositeRemaining.toString() });
        }
      }
    }

    return remainingAmount;
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

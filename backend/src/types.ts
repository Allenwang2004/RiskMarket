// 訂單類型定義
export interface Order {
  id: string;
  userAddress: string;
  tokenType: 'yes' | 'no';
  orderType: 'buy' | 'sell';
  tradeType: 'limit' | 'market'; // 新增：限價單或市價單
  price: string; // 以 ETH 為單位的價格字符串（市價單為當前最佳價格）
  amount: string; // 以 token 為單位的數量字符串 (剩餘數量)
  originalAmount: string; // 原始下單數量
  timestamp: number;
  status: 'pending' | 'matched' | 'cancelled';
}

// 交易匹配結果
export interface MatchResult {
  type: 'direct' | 'minting' | 'merge'; // 撮合類型
  buyOrder: Order;
  sellOrder: Order;
  matchedPrice?: string; // 可選：direct 才有成交價格
  matchedAmount: string;
  timestamp: number;
}

// 撮合配對信息（用於 minting 和 merge）
export interface MatchPair {
  yesOrder: Order;
  noOrder: Order;
  matchedAmount: string;
  timestamp: number;
}

// WebSocket 訊息類型
export interface WSMessage {
  type: 'order_submitted' | 'order_matched' | 'order_cancelled' | 'orderbook_update' | 'connected';
  data: any;
}

// 下單請求
export interface PlaceOrderRequest {
  userAddress: string;
  tokenType: 'yes' | 'no';
  orderType: 'buy' | 'sell';
  tradeType: 'limit' | 'market'; // 新增：限價單或市價單
  price?: string; // 可選：限價單必填，市價單可為空
  amount: string;
}

// 市價單預估結果
export interface MarketOrderEstimate {
  estimatedPrice: string;
  estimatedAmount: string;
  estimatedTotal: string;
  availableLiquidity: string;
}

// API 響應
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
}

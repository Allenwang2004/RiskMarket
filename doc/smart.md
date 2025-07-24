# Smart Contract

根據不同的 成交方式 要回傳 不同的資訊到合約

- Direct match 傳送
    
    
    | 參數 | 說明 |
    | --- | --- |
    | `buyer` | 買家錢包地址 |
    | `seller` | 賣家錢包地址 |
    | `marketId` | 所屬市場 |
    | `outcome` | YES / NO |
    | `amount` | 撮合數量 |
    | `price` | 成交價格（USDC） |
    | `condition_id` | 辨認是哪個市場的 |

- Minting 傳送
    
    
    | 參數 | 說明 |
    | --- | --- |
    | `yesBuyer` | 買 YES 的地址 |
    | `noBuyer` | 買 NO 的地址 |
    | `marketId` | 所屬市場 |
    | `amount` | 撮合數量 |
    | `price_yes` | 跟 YES 收取的錢 |
    | `price_no` | 跟 NO 收取的錢 |
    | `condition_id` | 辨認是哪個市場的 |

- Merge 傳送
    
    
    | 參數 | 說明 |
    | --- | --- |
    | `yesSeller` | 賣 YES 的地址 |
    | `noSeller` | 賣 NO 的地址 |
    | `marketId` | 所屬市場 |
    | `amount` | 撮合數量 |
    | `price_yes` | 要給 YES 的錢 |
    | `price_no` | 要給 NO 的錢 |
    | `condition_id` | 辨認是哪個市場的 |

合約框架

## CTFExchange.sol

負責管理 所有市場

每個市場 是由 `condition_id` 來做區分

它是由 `questionId`, `oracle`, `outcomeSlotCount` 組成的

- `questionId`：市場問題的哈希（來自 IPFS）
- `oracle`：負責判定結果的 oracle（如 UMA）
- `outcomeSlotCount`：結果數量（預設為 2）

後端訂單 搓合完之後 送出 訂單 給合約 CTFExchange.sol 處理

它會根據 `questionId` 辨識是哪一個市場的交易

CTFExchange.sol 依據不同交易類型（Direct / Mint / Merge）呼叫不同模組執行資產操作

### Direct Match（買/賣）

- CTFExchange 收到後端送入的匹配訂單
- 根據訂單中的 `questionId` 確認是什麼市場
- 呼叫 `Trading.sol` → 直接從賣方轉移 share 給買方，USDC 給賣方

### Minting（雙買產生 share）

- 後端發現 match 是 Buy YES + Buy NO
- CTFExchange 呼叫 `ConditionalTokens.sol`：
    - 把雙方 USDC 存入
    - 鑄造 YES / NO `positionId` share
    - 分別發送給買方

### Merge（雙賣銷毀 share 拿回 USDC）

- 後端發現 match 是 Sell YES + Sell NO
- CTFExchange 呼叫 `ConditionalTokens.sol`：
    - 銷毀雙方 share
    - 把 collateral（USDC）還給兩位賣方

### Oracle 回報結果

- UMA oracle 會回報某一市場的最終結果（YES 或 NO）
- CTFExchange 會透過 `reportPayouts()` 把結果儲存在該 `conditionId` 下

### 使用者 Redeem

- 持有獲勝的 `positionId` 的用戶可以呼叫：
- 合約會燒掉 ERC-1155 token 並退還 USDC
# DeFi Risk Market MVP

> 「讓 DeFi 安全風險變成一個可交易資產，無需資金池，也能對沖風險、激勵市場定價。」

DeFi 協議面臨高度的安全風險，包括智能合約漏洞、oracle 操縱、治理攻擊等。我們提出一種去中心化、無資本負擔的替代方案 —— **風險市場（Risk Market）**，基於 Prediction Market 架構，讓市場自行為「某協議是否在特定期間內遭受攻擊」進行定價。

## 專案結構

```
riskmarket/
├── frontend/          # 前端應用 (React/Next.js)
├── backend/           # 後端 API 服務
├── smartcontract/     # 智能合約 (Foundry)
└── README.md         # 專案說明
```

## 核心概念

### 產品邏輯

- **每個風險事件** 皆為一個 binary market（Yes / No）
  
  例：*「在 2025/12/31 前，某協議是否發生 $10M 以上資金損失？」*

- **使用者角色**
  - **對沖者（保守者）**：購買 Yes share 作為風險對沖，若協議遭攻擊則獲得收益
  - **投機者（樂觀者）**：購買 No share，預期協議安全，承擔風險並獲利
  - **流動性提供者（可選）**：使用 LMSR 自動做市或限價簿提供報價

- **市場清算**：依靠 oracle 或社群仲裁系統確定事件結果

### MVP 開發計劃

1. ✅ **建立本地鏈與風險市場（單一協議 / 單一事件）**
2. 🔄 建立單人資產管理系統（連接錢包）
3. 📋 建置交易引擎 + 虛擬模擬市場
4. 📋 結算流程（單市場，單使用者）
5. 📋 開放給多使用者（帳號系統 + 錢包連接）

## 智能合約架構

### 核心合約

1. **PredictionMarketFactory.sol** - 儲存市場資料，創建新市場
2. **PredictionMarket.sol** - 處理交易跟結算
3. **ShareToken.sol** - 管理 YES/NO 代幣
4. **Oracle.sol** - 判定事件是否發生

## 快速開始

### 智能合約開發

```bash
cd smartcontract

# 安裝 Foundry (如果尚未安裝)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 安裝依賴
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std

# 編譯合約
forge build

# 運行測試
forge test -vv

# 啟動本地鏈
anvil

# 部署合約到本地鏈
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

### 前端開發

```bash
cd frontend
# TODO: 前端設置說明
```

### 後端開發

```bash
cd backend
# TODO: 後端設置說明
```

## 技術棧

- **智能合約**: Solidity, Foundry, OpenZeppelin
- **區塊鏈**: Ethereum, Anvil (本地開發)
- **前端**: React/Next.js, Web3.js/Ethers.js
- **後端**: Node.js/Express 或 Python/FastAPI
- **數據庫**: PostgreSQL/MongoDB

## 主要功能

### 當前實現 (智能合約)

- ✅ 市場創建和管理
- ✅ YES/NO 股份交易
- ✅ 事件解決機制
- ✅ 贖回和結算功能
- ✅ 基本安全防護

### 計劃功能

- 📋 Web 前端界面
- 📋 錢包連接 (MetaMask)
- 📋 市場瀏覽和搜索
- 📋 用戶資產管理
- 📋 實時價格顯示
- 📋 交易歷史
- 📋 LMSR 自動做市商

## 安全特性

1. **重入攻擊防護** - ReentrancyGuard
2. **訪問控制** - Ownable 模式
3. **整數安全** - Solidity 0.8+ 內建檢查
4. **代幣安全** - SafeERC20 使用

## 貢獻指南

1. Fork 此專案
2. 創建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 授權

本專案採用 MIT 授權 - 詳見 [LICENSE](LICENSE) 文件

## 聯絡方式

如有問題或建議，請開啟 Issue 或聯絡開發團隊。
# RiskMarket

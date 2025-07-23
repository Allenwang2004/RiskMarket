#!/bin/bash

# 啟動 Risk Market 交易系統

echo "🚀 啟動 Risk Market 交易系統..."

# 檢查依賴是否已安裝
if [ ! -d "backend/node_modules" ]; then
    echo "📦 安裝後端依賴..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 安裝前端依賴..."
    cd frontend && npm install && cd ..
fi

# 啟動後端交易引擎
echo "🔧 啟動後端交易引擎 (端口 3001)..."
cd backend && npm run dev &
BACKEND_PID=$!

# 等待後端啟動
sleep 3

# 啟動前端應用
echo "🌐 啟動前端應用 (端口 3000)..."
cd frontend && npm run dev &
FRONTEND_PID=$!

echo "✅ 系統啟動完成！"
echo "📡 後端交易引擎: http://localhost:3001"
echo "🌐 前端應用: http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止所有服務..."

# 等待用戶中斷
wait

# 清理進程
echo "🛑 停止服務..."
kill $BACKEND_PID 2>/dev/null
kill $FRONTEND_PID 2>/dev/null
echo "👋 再見！"

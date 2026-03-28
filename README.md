# LINE AI Bot — 記帳 + 每日AI新聞摘要

## 功能
- 📊 **LINE 記帳機器人** — 說「午餐 150」自動記帳，「本月」查統計
- 📰 **每日 AI 新聞** — 每天 18:00 自動爬取 HN + Reddit + Anthropic，Claude Haiku 摘要後寄到你的 Email
- 🤖 **LINE 查詢** — 在 LINE 說「今日新聞」即時取得 AI 摘要

## 部署步驟

### 1. LINE Bot 設定
1. 前往 https://developers.line.biz/
2. 建立新 Provider → 建立 Messaging API Channel
3. 取得 `Channel Secret` 和 `Channel Access Token`（Long-lived）
4. Webhook URL 設為：`https://你的vercel域名/api/line/webhook`

### 2. Gmail App Password
1. Google 帳號 → 安全性 → 兩步驟驗證（開啟）
2. 安全性 → 應用程式密碼 → 生成16碼密碼
3. 填入 `GMAIL_APP_PASS`

### 3. Supabase 建表
在 Supabase SQL Editor 執行：`scripts/setup-expenses-table.sql`

### 4. 部署到 Vercel
```bash
cp .env.example .env.local   # 填入所有變數
vercel deploy --prod
```

### 5. 設定 Vercel 環境變數
在 Vercel Dashboard → Settings → Environment Variables 加入所有 .env.example 的變數

### 6. 測試
```bash
# 測試爬蟲（不需要任何 key）
node scripts/test-scrapers.mjs

# 本地啟動
npm run dev

# 手動觸發每日摘要（需設好環境變數）
curl -X GET http://localhost:3000/api/cron/daily \
  -H "Authorization: Bearer your-cron-secret"
```

## LINE Bot 指令
| 輸入 | 功能 |
|------|------|
| 午餐 120 | 記帳：餐飲 $120 |
| 搭捷運 35 | 記帳：交通 $35 |
| 本月 | 本月支出統計 |
| 本週 | 近7天支出明細 |
| 今日新聞 | 即時 AI 新聞摘要 |
| 幫助 | 查看說明 |

## 成本估算（月）
- Claude Haiku（每日摘要 ~1500 tokens + 記帳解析 ~200 tokens × N 筆）
  - 30天摘要：$0.03
  - 記帳解析 100 筆/月：$0.01
  - **合計：< $0.05/月** 💪
- Vercel Hobby（Cron 免費）
- Gmail SMTP（免費）
- **總成本：幾乎 $0**

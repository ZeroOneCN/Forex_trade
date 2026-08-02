# 个人交易统计

外汇/黄金交易记录与统计 Web 应用，支持 MT5 账单 Excel 导入、交易去重、资金流水管理、收益曲线、交易日历和仓位计算器。

## 技术栈

- **前端**：React 18 + React Router 6 + Vite 5
- **后端**：Node.js + Express
- **数据库**：MySQL（mysql2 连接池）
- **Excel 解析**：ExcelJS

## 功能模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 仪表盘 | `/` | 总览统计卡片、收益曲线、近期交易 |
| 交易记录 | `/trades` | 交易列表、筛选、分页、Excel 导入 |
| 交易日历 | `/calendar` | 日历视图展示每日盈亏、月度 ROI |
| 仓位计算器 | `/calculator` | 品种合约参数管理、仓位/强平/目标价计算 |
| 资金管理 | `/capital` | 出入金记录、赠金失效/扣除管理 |

## 快速开始

### 环境要求

- Node.js >= 18
- MySQL >= 8.0

### 安装

```bash
# 克隆仓库
git clone https://github.com/ZeroOneCN/Forex_trade.git
cd Forex_trade

# 安装依赖
npm install
```

### 数据库配置

在项目根目录创建 `.env` 文件：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=gold_trading
PORT=3001
```

### 启动

```bash
# 同时启动前端和后端（开发模式）
npm start

# 或分别启动
npm run server    # 后端 http://localhost:3001
npm run client    # 前端 http://localhost:5173

# 构建生产包
npm run build
```

## 数据导入规则

### Excel 文件格式

支持多 Sheet Excel 文件，通过表头自动识别 Sheet 类型：

- **交易表**：包含 `交易品种` 列
- **资金表**：包含 `类型` 和 `金额` 列

### 交易去重机制

1. **主要去重键**：`position_id`（仓位 ID）
   - 优先从 `仓位ID` 列读取
   - 若无该列，从 `备注` 列通过正则 `ID[:\s]*(\d+)` 提取
2. **辅助去重键**：`dedup_key`（用于无 position_id 的记录）
   - 组成：`position_id|trade_date|symbol|order_type|open_price|volume|close_price|open_time|close_time`
   - 数字格式化对齐 Python `f"{float(v):.6g}"` 规则
3. **品种标准化**：导入时自动去除品种后缀（如 `XAUUSD.S` → `XAUUSD`、`XAUUSD+` → `XAUUSD`），去重逻辑不受影响

### 资金去重机制

- **去重键**：`flow_date|type|amount(2位小数)|remark`
- 资金类型标准化映射：
  - `入金` / `deposit` → `deposit`
  - `出金` / `withdraw` → `withdrawal`
  - `赠金` / `bonus` → `bonus`（正数）或 `bonus_loss`（负数）
  - `失效` / `expired` → `bonus_expired`
  - `亏损` / `loss` → `bonus_loss`

## 项目结构

```
Forex_trade/
├── client/                  # 前端
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js    # API 请求封装
│   │   ├── components/
│   │   │   ├── ConfirmDialog.jsx
│   │   │   ├── EquityCurve.jsx
│   │   │   ├── ImportButton.jsx
│   │   │   └── Layout.jsx
│   │   ├── pages/
│   │   │   ├── Calculator.jsx
│   │   │   ├── Calendar.jsx
│   │   │   ├── Capital.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── Trades.jsx
│   │   ├── App.jsx
│   │   ├── index.css        # 全局样式（含深色/浅色主题）
│   │   └── main.jsx
│   └── index.html
├── server/                  # 后端
│   ├── src/
│   │   ├── routes/
│   │   │   ├── capital.js   # 资金流水路由
│   │   │   ├── stats.js     # 统计数据路由
│   │   │   ├── symbols.js   # 品种参数路由
│   │   │   └── trades.js    # 交易记录路由
│   │   ├── utils/
│   │   │   └── excelParser.js  # Excel 解析与去重
│   │   ├── db.js            # 数据库初始化与连接池
│   │   └── index.js         # Express 入口
│   └── uploads/             # 临时上传目录（gitignore）
├── .env                     # 环境变量（gitignore）
├── .gitignore
├── Design.md                # 设计文档
├── package.json
└── vite.config.js
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/trades` | 查询交易列表（支持筛选、分页） |
| POST | `/api/trades/import` | 导入 Excel（交易 + 资金） |
| DELETE | `/api/trades/:id` | 刢单条交易 |
| GET | `/api/capital` | 查询资金流水 |
| POST | `/api/capital` | 新增资金记录 |
| POST | `/api/capital/import` | 导入资金 Excel |
| DELETE | `/api/capital/:id` | 删资金记录 |
| GET | `/api/symbols` | 查询品种参数 |
| PUT | `/api/symbols/:id` | 更新品种参数 |
| GET | `/api/stats/dashboard` | 仪表盘统计数据 |
| GET | `/api/stats/calendar` | 日历统计数据 |

## 开发规则

1. **数据去重**：交易去重以 `position_id` 为主，`dedup_key` 为辅；资金去重以 `dedup_key` 唯一索引
2. **品种标准化**：所有品种名称导入时自动去除后缀（`.S`、`+` 等），大写统一
3. **数字格式化**：去重键中的数字使用 `pythonG6` 函数（对齐 Python `f"{v:.6g}"`），确保跨工具一致
4. **日期格式**：统一使用 `YYYY-MM-DD` 格式
5. **主题**：支持深色/浅色双主题，通过 `data-theme` 属性切换，页面刷新保留主题设置
6. **弹窗**：所有弹窗必须通过点击按钮（确认/取消/关闭）关闭，禁止点击遮罩关闭
7. **Tab 保持**：页面刷新后保持当前 Tab（使用 localStorage）
8. **收益曲线**：从 0 开始，0 以上绿色、0 以下红色，使用 SVG clipPath 实现颜色分段

## License

Private

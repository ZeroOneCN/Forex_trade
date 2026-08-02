const mysql = require('mysql2/promise')
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'gold_trading',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true
})

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS trades (
    id VARCHAR(36) PRIMARY KEY,
    position_id BIGINT,
    trade_date DATE,
    symbol VARCHAR(20) NOT NULL,
    order_type ENUM('buy','sell') NOT NULL,
    open_price DECIMAL(12,5),
    volume DECIMAL(12,2),
    commission DECIMAL(12,2),
    close_price DECIMAL(12,5),
    profit DECIMAL(12,2),
    swap_fee DECIMAL(12,2),
    open_time TIME,
    close_time TIME,
    holding_time VARCHAR(20),
    remark VARCHAR(255),
    dedup_key VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dedup_key (dedup_key),
    INDEX idx_trade_date (trade_date),
    INDEX idx_symbol (symbol)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS capital_flows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    flow_date DATE NOT NULL,
    type VARCHAR(30) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    remark VARCHAR(255),
    dedup_key VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dedup (dedup_key),
    INDEX idx_flow_date (flow_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS symbols (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(20) UNIQUE NOT NULL,
    contract_size BIGINT DEFAULT 100,
    leverage INT DEFAULT 100,
    digits INT DEFAULT 2,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
]

// 预置通用外汇品种参数
const PRESET_SYMBOLS = [
  { name: 'XAUUSD', contract_size: 100, leverage: 100, digits: 2 },
  { name: 'XAGUSD', contract_size: 5000, leverage: 100, digits: 3 },
  { name: 'USDJPY', contract_size: 100000, leverage: 100, digits: 3 },
  { name: 'EURUSD', contract_size: 100000, leverage: 100, digits: 5 },
  { name: 'GBPUSD', contract_size: 100000, leverage: 100, digits: 5 },
  { name: 'USDCHF', contract_size: 100000, leverage: 100, digits: 5 },
  { name: 'AUDUSD', contract_size: 100000, leverage: 100, digits: 5 },
  { name: 'USDCAD', contract_size: 100000, leverage: 100, digits: 5 },
  { name: 'NZDUSD', contract_size: 100000, leverage: 100, digits: 5 },
  { name: 'EURJPY', contract_size: 100000, leverage: 100, digits: 3 },
  { name: 'GBPJPY', contract_size: 100000, leverage: 100, digits: 3 },
]

async function initDB() {
  for (const sql of SCHEMA_SQL) {
    await pool.execute(sql)
  }
  // 预置品种种子数据
  for (const s of PRESET_SYMBOLS) {
    await pool.execute(
      'INSERT IGNORE INTO symbols (name, contract_size, leverage, digits) VALUES (?, ?, ?, ?)',
      [s.name, s.contract_size, s.leverage, s.digits]
    )
  }

  // 清理 capital_flows 重复数据（保留最小 id 的记录）
  await pool.query(`
    DELETE c1 FROM capital_flows c1
    INNER JOIN capital_flows c2
    ON c1.flow_date = c2.flow_date
      AND c1.type = c2.type
      AND c1.amount = c2.amount
      AND COALESCE(c1.remark, '') = COALESCE(c2.remark, '')
      AND c1.id > c2.id
  `)

  // 为 dedup_key 为 NULL 的记录补全
  const [nullDedup] = await pool.query('SELECT id, flow_date, type, amount, remark FROM capital_flows WHERE dedup_key IS NULL')
  for (const row of nullDedup) {
    const key = `${row.flow_date}|${row.type}|${Number(row.amount).toFixed(2)}|${row.remark || ''}`
    await pool.execute('UPDATE capital_flows SET dedup_key = ? WHERE id = ?', [key, row.id])
  }

  // 迁移 bns 类型数据：正数 → bonus，负数 → bonus_loss（金额转绝对值）
  const [bnsRows] = await pool.query("SELECT id, amount FROM capital_flows WHERE type = 'bns'")
  for (const row of bnsRows) {
    const amt = Number(row.amount)
    if (amt > 0) {
      await pool.execute("UPDATE capital_flows SET type = 'bonus', amount = ? WHERE id = ?", [amt, row.id])
    } else {
      await pool.execute("UPDATE capital_flows SET type = 'bonus_loss', amount = ? WHERE id = ?", [Math.abs(amt), row.id])
    }
  }

  // 修复 bonus 类型中的负数金额：负数 → bonus_loss（金额转绝对值）
  const [negBonus] = await pool.query("SELECT id, amount FROM capital_flows WHERE type = 'bonus' AND amount < 0")
  for (const row of negBonus) {
    await pool.execute("UPDATE capital_flows SET type = 'bonus_loss', amount = ? WHERE id = ?", [Math.abs(Number(row.amount)), row.id])
  }

  // 撤销上次错误迁移：之前把 deposit + bns remark 错改成 bonus 的，还原为 deposit
  const [wrongBonus] = await pool.query("SELECT id, amount, remark FROM capital_flows WHERE type = 'bonus' AND remark LIKE 'bns%'")
  for (const row of wrongBonus) {
    await pool.execute("UPDATE capital_flows SET type = 'deposit' WHERE id = ?", [row.id])
  }

  // 重建 capital_flows 的 dedup_key（以防之前迁移中的错误）
  const [capRows] = await pool.query('SELECT id, flow_date, type, amount, remark FROM capital_flows')
  for (const row of capRows) {
    const amt = Number(row.amount)
    const normAmt = Math.abs(amt)
    const key = `${row.flow_date}|${row.type}|${normAmt.toFixed(2)}|${row.remark || ''}`
    if (key !== row.dedup_key) {
      await pool.execute('UPDATE capital_flows SET dedup_key = ? WHERE id = ?', [key, row.id])
    }
  }

  // 清理 capital_flows 重复（基于正确的 dedup_key）
  await pool.query(`
    DELETE c1 FROM capital_flows c1
    INNER JOIN capital_flows c2
    ON c1.dedup_key = c2.dedup_key AND c1.id > c2.id
  `)

  // 重算 trades 稳定 id + dedup_key：对齐 MT5 转换工具
  // 先确保 dedup_key 列存在
  try {
    await pool.query("ALTER TABLE trades ADD COLUMN dedup_key VARCHAR(500)")
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') console.log('[db] dedup_key column already exists')
  }
  // 添加 uk_position_id 唯一索引（如果不存在）
  try {
    await pool.query("ALTER TABLE trades ADD UNIQUE KEY uk_position_id (position_id)")
  } catch (e) {
    if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_ENTRY') console.log('[db] uk_position_id index:', e.message)
  }
  // 添加 uk_dedup_key 唯一索引
  try {
    await pool.query("ALTER TABLE trades ADD UNIQUE KEY uk_dedup_key (dedup_key)")
  } catch (e) {
    if (e.code !== 'ER_DUP_KEYNAME') console.log('[db] uk_dedup_key already exists')
  }

  // 对齐 Python f"{float(v):.6g}" 的格式化
  const pythonG6 = (v) => {
    if (v == null || v === '') return ''
    const n = Number(v)
    if (isNaN(n)) return ''
    if (n === 0) return '0'
    const abs = Math.abs(n)
    const exp = Math.floor(Math.log10(abs))
    if (exp < -4 || exp >= 6) {
      let s = n.toPrecision(6)
      s = s.replace(/(\.\d*?)0+e/, '$1e')
      if (s.includes('.') && /e/.test(s) && s.indexOf('.') > s.indexOf('e')) {
        s = s.replace(/\./, '')
      }
      s = s.replace(/e([+-])(\d)$/, 'e$10$2')
      return s
    } else {
      const decimals = Math.max(0, 5 - exp)
      return n.toFixed(decimals).replace(/\.?0+$/, '')
    }
  }
  const md5 = (s) => require('crypto').createHash('md5').update(s).digest('hex')
  const makeId = (hash) => `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`
  // 与 excelParser.normalizeSymbol 保持一致
  const normalizeSymbol = (symbol) => {
    if (!symbol) return ''
    let s = String(symbol).trim().toUpperCase()
    s = s.replace(/\+$/, '')
    s = s.replace(/\.[A-Z]$/, '')
    s = s.replace(/\.[A-Z]{1,2}$/, '')
    return s
  }

  const [trades] = await pool.query(`
    SELECT id, position_id, trade_date, symbol, order_type,
           open_price, volume, close_price, open_time, close_time
    FROM trades
  `)

  for (const t of trades) {
    // 标准化品种名称：同步写入 symbol 列和 dedup_key
    const normSymbol = normalizeSymbol(t.symbol)
    const key = [
      t.position_id == null ? '' : String(t.position_id),
      t.trade_date || '',
      normSymbol || '',
      t.order_type || '',
      pythonG6(t.open_price),
      pythonG6(t.volume),
      pythonG6(t.close_price),
      t.open_time || '',
      t.close_time || ''
    ].join('|')
    const newId = makeId(md5(key))
    try {
      await pool.execute(
        'UPDATE trades SET id = ?, dedup_key = ?, symbol = ? WHERE id = ?',
        [newId, key, normSymbol, t.id]
      )
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        // dedup_key 冲突 = 重复记录，删除
        await pool.execute('DELETE FROM trades WHERE id = ?', [t.id])
      } else {
        throw err
      }
    }
  }

  console.log('[db] schema initialized')
}

module.exports = { pool, initDB }

const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { pool } = require('../db')
const { parseExcel } = require('../utils/excelParser')

const router = express.Router()
const upload = multer({ dest: path.join(__dirname, '../../uploads/') })

// 动态同步品种到 symbols 表
async function syncSymbols(symbols) {
  for (const name of symbols) {
    await pool.execute(
      'INSERT IGNORE INTO symbols (name) VALUES (?)',
      [name]
    )
  }
}

// 列表查询（分页 + 筛选 + 模糊搜索）
router.get('/', async (req, res) => {
  try {
    const { symbol, type, startDate, endDate, search, page = 1, pageSize = 50 } = req.query
    const conditions = []
    const params = []

    if (symbol) { conditions.push('symbol = ?'); params.push(symbol) }
    if (type) { conditions.push('order_type = ?'); params.push(type) }
    if (startDate) { conditions.push('trade_date >= ?'); params.push(startDate) }
    if (endDate) { conditions.push('trade_date <= ?'); params.push(endDate) }
    // 模糊搜索：品种、备注、盈亏、仓位ID
    if (search) {
      conditions.push('(symbol LIKE ? OR remark LIKE ? OR CAST(position_id AS CHAR) LIKE ? OR CAST(profit AS CHAR) LIKE ? OR CAST(open_price AS CHAR) LIKE ? OR CAST(close_price AS CHAR) LIKE ?)')
      const kw = `%${search}%`
      params.push(kw, kw, kw, kw, kw, kw)
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const offset = (page - 1) * pageSize

    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM trades ${where}`, params)
    const [rows] = await pool.query(
      `SELECT * FROM trades ${where} ORDER BY trade_date DESC, close_time DESC LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    )

    res.json({
      data: rows,
      total: countRows[0].total,
      page: Number(page),
      pageSize: Number(pageSize)
    })
  } catch (err) {
    console.error('[trades] list error:', err)
    res.status(500).json({ error: err.message })
  }
})

// 导入 Excel（多 Sheet）
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })

  try {
    const { trades, capitalFlows, sheets } = await parseExcel(req.file.path)

    let tradeInserted = 0
    let tradeSkipped = 0
    let capitalInserted = 0
    let capitalSkipped = 0

    // 导入交易记录：用 position_id 做主要去重，dedup_key 做辅助去重
    if (trades.length > 0) {
      const symbols = [...new Set(trades.map(t => t.symbol))]
      await syncSymbols(symbols)

      // 批量检查 position_id 是否已存在
      const positionIds = [...new Set(trades.map(t => t.position_id).filter(x => x))]
      const existingPositionIds = new Set()
      if (positionIds.length > 0) {
        const batchSize = 500
        for (let i = 0; i < positionIds.length; i += batchSize) {
          const batch = positionIds.slice(i, i + batchSize)
          const placeholders = batch.map(() => '?').join(',')
          const [rows] = await pool.query(
            `SELECT position_id FROM trades WHERE position_id IN (${placeholders})`,
            batch
          )
          rows.forEach(r => existingPositionIds.add(String(r.position_id)))
        }
      }

      // 批量检查 dedup_key 是否已存在（对于没有 position_id 的记录）
      const noPositionIdTrades = trades.filter(t => !t.position_id)
      const existingDedupKeys = new Set()
      if (noPositionIdTrades.length > 0) {
        const dedupKeys = [...new Set(noPositionIdTrades.map(t => t.dedup_key))]
        const batchSize = 500
        for (let i = 0; i < dedupKeys.length; i += batchSize) {
          const batch = dedupKeys.slice(i, i + batchSize)
          const placeholders = batch.map(() => '?').join(',')
          const [rows] = await pool.query(
            `SELECT dedup_key FROM trades WHERE dedup_key IN (${placeholders})`,
            batch
          )
          rows.forEach(r => existingDedupKeys.add(r.dedup_key))
        }
      }

      for (const t of trades) {
        // 检查是否已存在（优先用 position_id，其次用 dedup_key）
        if (t.position_id && existingPositionIds.has(String(t.position_id))) {
          tradeSkipped++
          continue
        }
        if (!t.position_id && existingDedupKeys.has(t.dedup_key)) {
          tradeSkipped++
          continue
        }

        try {
          const [result] = await pool.execute(
            `INSERT IGNORE INTO trades
             (id, position_id, trade_date, symbol, order_type, open_price, volume,
              commission, close_price, profit, swap_fee, open_time, close_time,
              holding_time, remark, dedup_key)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [t.id, t.position_id, t.trade_date, t.symbol, t.order_type,
             t.open_price, t.volume, t.commission, t.close_price, t.profit,
             t.swap_fee, t.open_time, t.close_time, t.holding_time, t.remark, t.dedup_key]
          )
          if (result.affectedRows > 0) {
            tradeInserted++
            // 新增成功后更新已存在集合，防止同批数据重复
            if (t.position_id) existingPositionIds.add(String(t.position_id))
            existingDedupKeys.add(t.dedup_key)
          } else {
            tradeSkipped++
          }
        } catch {
          tradeSkipped++
        }
      }
    }

    // 导入资金流水：用 dedup_key 做 INSERT IGNORE 去重
    if (capitalFlows.length > 0) {
      for (const c of capitalFlows) {
        try {
          const [result] = await pool.execute(
            `INSERT IGNORE INTO capital_flows (flow_date, type, amount, remark, dedup_key)
             VALUES (?, ?, ?, ?, ?)`,
            [c.flow_date, c.type, c.amount, c.remark, c.dedup_key]
          )
          if (result.affectedRows > 0) capitalInserted++
          else capitalSkipped++
        } catch {
          capitalSkipped++
        }
      }
    }

    // 删除临时文件
    fs.unlink(req.file.path, () => {})

    res.json({
      success: true,
      sheets,
      trades: { total: trades.length, inserted: tradeInserted, skipped: tradeSkipped },
      capital: { total: capitalFlows.length, inserted: capitalInserted, skipped: capitalSkipped }
    })
  } catch (err) {
    console.error('[trades] import error:', err)
    if (req.file) fs.unlink(req.file.path, () => {})
    res.status(500).json({ error: err.message })
  }
})

// 导出多 Sheet Excel（交易 + 资金）
router.get('/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs')
    const wb = new ExcelJS.Workbook()

    // Sheet 1: 交易记录
    const ws1 = wb.addWorksheet('交易记录')
    const tradeHeaders = ['ID', '仓位ID', '日期', '交易品种', '订单类型', '开仓价格',
      '手数', '手续费', '平仓价格', '盈亏金额', '隔夜费', '开仓时间', '平仓时间', '持仓时间', '备注']
    ws1.addRow(tradeHeaders)
    ws1.getRow(1).font = { bold: true }

    const [trades] = await pool.query(
      'SELECT id, position_id, trade_date, symbol, order_type, open_price, volume, ' +
      'commission, close_price, profit, swap_fee, open_time, close_time, holding_time, remark ' +
      'FROM trades ORDER BY trade_date DESC, close_time DESC'
    )
    for (const t of trades) {
      ws1.addRow([
        t.id, t.position_id, t.trade_date, t.symbol, t.order_type,
        t.open_price, t.volume, t.commission, t.close_price,
        t.profit, t.swap_fee, t.open_time, t.close_time, t.holding_time, t.remark
      ])
    }

    // 自动列宽
    ws1.columns.forEach(col => { col.width = 18 })

    // Sheet 2: 资金流水
    const ws2 = wb.addWorksheet('资金流水')
    ws2.addRow(['日期', '类型', '金额', '备注'])
    ws2.getRow(1).font = { bold: true }

    const [flows] = await pool.query(
      'SELECT flow_date, type, amount, remark FROM capital_flows ORDER BY flow_date DESC'
    )
    for (const f of flows) {
      ws2.addRow([f.flow_date, f.type, f.amount, f.remark])
    }
    ws2.columns.forEach(col => { col.width = 18 })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="gold_export.xlsx"')
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    console.error('[trades] export error:', err)
    res.status(500).json({ error: err.message })
  }
})

// 下载导入模板
router.get('/template', async (req, res) => {
  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook()

  // Sheet 1: 交易模板
  const ws1 = wb.addWorksheet('交易记录')
  const tradeHeaders = ['ID', '仓位ID', '日期时间', '交易品种', '订单类型', '开仓价格',
    '手数', '手续费', '平仓价格', '盈亏金额', '隔夜费', '开仓时间', '平仓时间', '持仓时间', '备注']
  ws1.addRow(tradeHeaders)
  ws1.getRow(1).font = { bold: true }

  // Sheet 2: 资金模板
  const ws2 = wb.addWorksheet('资金流水')
  ws2.addRow(['日期', '类型', '金额', '备注'])
  ws2.getRow(1).font = { bold: true }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="gold_template.xlsx"')
  await wb.xlsx.write(res)
  res.end()
})

// 删除单条交易
router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM trades WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

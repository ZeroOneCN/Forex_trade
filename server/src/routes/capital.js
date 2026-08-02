const express = require('express')
const { pool } = require('../db')

const router = express.Router()

// 列表查询（分页）
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, page = 1, pageSize = 50 } = req.query
    const conditions = []
    const params = []

    if (startDate) { conditions.push('flow_date >= ?'); params.push(startDate) }
    if (endDate) { conditions.push('flow_date <= ?'); params.push(endDate) }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const offset = (page - 1) * pageSize

    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM capital_flows ${where}`, params)
    const [rows] = await pool.query(
      `SELECT * FROM capital_flows ${where} ORDER BY flow_date DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    )

    res.json({
      data: rows,
      total: countRows[0].total,
      page: Number(page),
      pageSize: Number(pageSize)
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 手动新增
router.post('/', async (req, res) => {
  try {
    const { flow_date, type, amount, remark } = req.body
    if (!flow_date || !type || amount == null) {
      return res.status(400).json({ error: '缺少必填字段' })
    }
    const dedupKey = `${flow_date}|${type}|${Number(amount).toFixed(2)}|${remark || ''}`
    const [result] = await pool.execute(
      `INSERT IGNORE INTO capital_flows (flow_date, type, amount, remark, dedup_key)
       VALUES (?, ?, ?, ?, ?)`,
      [flow_date, type, amount, remark || '', dedupKey]
    )
    if (result.affectedRows === 0) {
      res.json({ success: false, message: '记录已存在（去重）' })
    } else {
      res.json({ success: true, id: result.insertId })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 删除
router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM capital_flows WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

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

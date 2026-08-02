const express = require('express')
const { pool } = require('../db')

const router = express.Router()

// 列出所有品种
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM symbols ORDER BY name')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 更新品种参数（合约大小、杠杆、小数位）
router.put('/:id', async (req, res) => {
  try {
    const { contract_size, leverage, digits } = req.body
    const [result] = await pool.execute(
      'UPDATE symbols SET contract_size = ?, leverage = ?, digits = ? WHERE id = ?',
      [contract_size, leverage, digits, req.params.id]
    )
    res.json({ success: result.affectedRows > 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

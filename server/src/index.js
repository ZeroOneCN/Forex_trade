const express = require('express')
const cors = require('cors')
const path = require('path')
const { initDB } = require('./db')

const tradesRouter = require('./routes/trades')
const capitalRouter = require('./routes/capital')
const symbolsRouter = require('./routes/symbols')
const statsRouter = require('./routes/stats')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// 路由
app.use('/api/trades', tradesRouter)
app.use('/api/capital', capitalRouter)
app.use('/api/symbols', symbolsRouter)
app.use('/api/stats', statsRouter)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] running on http://localhost:${PORT}`)
  })
}).catch(err => {
  console.error('[server] failed to start:', err)
  process.exit(1)
})

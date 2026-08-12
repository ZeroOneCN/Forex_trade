const express = require('express')
const cors = require('cors')
const path = require('path')
const os = require('os')
const { initDB } = require('./db')

const tradesRouter = require('./routes/trades')
const capitalRouter = require('./routes/capital')
const symbolsRouter = require('./routes/symbols')
const statsRouter = require('./routes/stats')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// 生产环境：托管前端构建产物
const distPath = path.join(__dirname, '../../dist')
app.use(express.static(distPath))

// 路由
app.use('/api/trades', tradesRouter)
app.use('/api/capital', capitalRouter)
app.use('/api/symbols', symbolsRouter)
app.use('/api/stats', statsRouter)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// SPA 回退：非 API 路由返回 index.html
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// 获取局域网 IP
function getLANIP() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return null
}

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    const lanIP = getLANIP()
    console.log(`\n  ➜  Local:   http://localhost:${PORT}`)
    if (lanIP) {
      console.log(`  ➜  Network: http://${lanIP}:${PORT}`)
    }
    console.log(`  ➜  API:     http://localhost:${PORT}/api/health\n`)
  })
}).catch(err => {
  console.error('[server] failed to start:', err)
  process.exit(1)
})

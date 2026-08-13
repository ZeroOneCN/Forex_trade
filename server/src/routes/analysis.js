const express = require('express')
const { pool } = require('../db')

const router = express.Router()

// 综合分析报告
router.get('/insights', async (req, res) => {
  try {
    // 1. 核心指标
    const [stats] = await pool.query(`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as win_count,
        SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) as loss_count,
        COALESCE(SUM(profit + commission + swap_fee), 0) as net_profit,
        COALESCE(AVG(CASE WHEN profit > 0 THEN profit + commission + swap_fee END), 0) as avg_win,
        COALESCE(AVG(CASE WHEN profit <= 0 THEN profit + commission + swap_fee END), 0) as avg_loss
      FROM trades
    `)
    const s = stats[0]
    const winRate = s.total_trades > 0 ? (s.win_count / s.total_trades * 100) : 0
    const avgWin = Number(s.avg_win)
    const avgLoss = Math.abs(Number(s.avg_loss))
    const profitFactor = avgLoss > 0 ? (avgWin * s.win_count) / (avgLoss * s.loss_count) : avgWin > 0 ? Infinity : 0
    const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss)

    // 2. 月度趋势
    const [monthly] = await pool.query(`
      SELECT DATE_FORMAT(trade_date, '%Y-%m') as ym,
        COUNT(*) as trades,
        COALESCE(SUM(profit + commission + swap_fee), 0) as net_profit,
        SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) as losses
      FROM trades
      GROUP BY ym
      ORDER BY ym
    `)

    // 3. 品种分析
    const [symbols] = await pool.query(`
      SELECT symbol,
        COUNT(*) as trades,
        COALESCE(SUM(profit + commission + swap_fee), 0) as net_profit,
        SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) as losses
      FROM trades
      GROUP BY symbol
      ORDER BY net_profit ASC
    `)

    // 4. 连续盈亏
    const [allTrades] = await pool.query(
      'SELECT profit + commission + swap_fee as pnl FROM trades ORDER BY close_time ASC'
    )
    let maxLossStreak = 0, curLoss = 0
    let maxWinStreak = 0, curWin = 0
    let currentLossStreak = 0, currentWinStreak = 0
    for (const t of allTrades) {
      if (t.pnl <= 0) {
        curLoss++
        curWin = 0
        maxLossStreak = Math.max(maxLossStreak, curLoss)
        currentLossStreak = curLoss
        currentWinStreak = 0
      } else {
        curWin++
        curLoss = 0
        maxWinStreak = Math.max(maxWinStreak, curWin)
        currentWinStreak = curWin
        currentLossStreak = 0
      }
    }

    // 5. 大额亏损
    const [bigLosses] = await pool.query(`
      SELECT trade_date, symbol, volume, profit + commission + swap_fee as net_pnl
      FROM trades
      WHERE profit + commission + swap_fee < -50
      ORDER BY close_time DESC
      LIMIT 20
    `)
    const totalBigLoss = bigLosses.reduce((sum, r) => sum + Number(r.net_pnl), 0)

    // 6. 最大回撤
    let peak = 0, maxDrawdown = 0, equity = 0
    for (const t of allTrades) {
      equity += Number(t.pnl)
      if (equity > peak) peak = equity
      maxDrawdown = Math.max(maxDrawdown, peak - equity)
    }

    // 7. 手数行为分析
    const [volumeAnalysis] = await pool.query(`
      SELECT
        AVG(CASE WHEN profit > 0 THEN volume END) as avg_win_vol,
        AVG(CASE WHEN profit <= 0 THEN volume END) as avg_loss_vol,
        AVG(volume) as avg_volume,
        MAX(volume) as max_volume
      FROM trades
    `)

    res.json({
      // 核心指标
      total_trades: s.total_trades,
      win_count: s.win_count,
      loss_count: s.loss_count,
      win_rate: Number(winRate.toFixed(2)),
      net_profit: Number(s.net_profit),
      avg_win: Number(avgWin.toFixed(2)),
      avg_loss: Number(avgLoss.toFixed(2)),
      profit_factor: Number(profitFactor.toFixed(2)),
      expectancy: Number(expectancy.toFixed(2)),
      max_drawdown: Number(maxDrawdown.toFixed(2)),
      // 连续盈亏
      max_loss_streak: maxLossStreak,
      max_win_streak: maxWinStreak,
      current_loss_streak: currentLossStreak,
      current_win_streak: currentWinStreak,
      // 大额亏损
      big_loss_count: bigLosses.length,
      big_loss_total: Number(totalBigLoss.toFixed(2)),
      big_losses: bigLosses.map(r => ({
        date: r.trade_date,
        symbol: r.symbol,
        volume: Number(r.volume),
        net_pnl: Number(r.net_pnl)
      })),
      // 月度
      monthly: monthly.map(m => ({
        ym: m.ym,
        trades: m.trades,
        net_profit: Number(m.net_profit),
        wins: m.wins,
        losses: m.losses,
        win_rate: m.trades > 0 ? Number(((m.wins / m.trades) * 100).toFixed(1)) : 0
      })),
      // 品种
      symbols: symbols.map(sym => ({
        symbol: sym.symbol,
        trades: sym.trades,
        net_profit: Number(sym.net_profit),
        wins: sym.wins,
        losses: sym.losses,
        win_rate: sym.trades > 0 ? Number(((sym.wins / sym.trades) * 100).toFixed(1)) : 0
      })),
      // 手数
      volume_analysis: {
        avg_win_vol: Number(volumeAnalysis[0].avg_win_vol || 0).toFixed(2),
        avg_loss_vol: Number(volumeAnalysis[0].avg_loss_vol || 0).toFixed(2),
        avg_volume: Number(volumeAnalysis[0].avg_volume || 0).toFixed(2),
        max_volume: Number(volumeAnalysis[0].max_volume || 0).toFixed(2)
      }
    })
  } catch (err) {
    console.error('[analysis] insights error:', err)
    res.status(500).json({ error: err.message })
  }
})

// 阈值突破检测
router.get('/thresholds', async (req, res) => {
  try {
    // 1. 获取所有交易按时间排序
    const [allTrades] = await pool.query(`
      SELECT trade_date, profit + commission + swap_fee as pnl, symbol, volume, close_time
      FROM trades ORDER BY close_time ASC
    `)

    // 2. 计算累计净值曲线，标记每次创新高
    const peaks = []
    let cumulative = 0, peakEquity = 0
    let tradeIndex = 0
    for (const t of allTrades) {
      cumulative += Number(t.pnl)
      tradeIndex++
      if (cumulative > peakEquity) {
        peakEquity = cumulative
        peaks.push({ equity: Number(cumulative.toFixed(2)), tradeIndex, date: t.trade_date })
      }
    }
    // 最后一个净值点
    const finalEquity = Number(cumulative.toFixed(2))

    // 3. 对每个历史高点（剔除最后一个），分析高点前后行为
    const thresholdResults = []
    // 只看交易量大的高点（前 80% 的位置）
    const significantPeaks = peaks.filter(p => p.tradeIndex > 10 && p.tradeIndex < allTrades.length - 5)

    for (const peak of significantPeaks) {
      const before = allTrades.slice(Math.max(0, peak.tradeIndex - 31), peak.tradeIndex - 1)
      const after = allTrades.slice(peak.tradeIndex, Math.min(allTrades.length, peak.tradeIndex + 30))

      const beforeWins = before.filter(t => t.pnl > 0).length
      const afterWins = after.filter(t => t.pnl > 0).length
      const beforeAvgLoss = before.filter(t => t.pnl <= 0).reduce((s, t) => s + Number(t.pnl), 0) / (before.length - beforeWins || 1)
      const afterAvgLoss = after.filter(t => t.pnl <= 0).reduce((s, t) => s + Number(t.pnl), 0) / (after.length - afterWins || 1)
      const beforeAvgVol = before.reduce((s, t) => s + Number(t.volume), 0) / (before.length || 1)
      const afterAvgVol = after.reduce((s, t) => s + Number(t.volume), 0) / (after.length || 1)

      const afterPnl = after.reduce((s, t) => s + Number(t.pnl), 0)

      thresholdResults.push({
        peak_equity: peak.equity,
        date: peak.date,
        trade_index: peak.tradeIndex,
        // 高点前 30 笔
        before: {
          trades: before.length,
          win_rate: before.length > 0 ? Number(((beforeWins / before.length) * 100).toFixed(1)) : 0,
          avg_loss: Number(Math.abs(beforeAvgLoss).toFixed(2)),
          avg_volume: Number(beforeAvgVol.toFixed(2))
        },
        // 高点后 30 笔
        after: {
          trades: after.length,
          win_rate: after.length > 0 ? Number(((afterWins / after.length) * 100).toFixed(1)) : 0,
          avg_loss: Number(Math.abs(afterAvgLoss).toFixed(2)),
          avg_volume: Number(afterAvgVol.toFixed(2)),
          net_pnl: Number(afterPnl.toFixed(2))
        }
      })
    }

    res.json({
      current_equity: finalEquity,
      peak_equity: peaks.length > 0 ? peaks[peaks.length - 1].equity : 0,
      peaks: peaks.map(p => ({ equity: p.equity, date: p.date })),
      thresholds: thresholdResults.sort((a, b) => a.peak_equity - b.peak_equity)
    })
  } catch (err) {
    console.error('[analysis] thresholds error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
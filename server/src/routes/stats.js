const express = require('express')
const { pool } = require('../db')

const router = express.Router()

// 总览统计
router.get('/overview', async (req, res) => {
  try {
    const [tradeStats] = await pool.query(`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as win_count,
        SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) as loss_count,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(SUM(commission), 0) as total_commission,
        COALESCE(SUM(swap_fee), 0) as total_swap,
        COALESCE(SUM(profit + commission + swap_fee), 0) as net_profit
      FROM trades
    `)

    // 资金统计：
    // - real_deposit: deposit 类型，remark 不以 bns 开头（真实入金）
    // - bonus_given: deposit 类型且 remark 以 bns 开头（体验金发放，按 bns 前缀判断）
    //   或 type='bonus'（兼容历史数据）
    const [capitalStats] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'deposit' AND (remark IS NULL OR LEFT(remark, 3) <> 'bns') THEN amount ELSE 0 END), 0) as total_deposit,
        COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END), 0) as total_withdrawal,
        COALESCE(SUM(CASE WHEN (type = 'deposit' AND LEFT(remark, 3) = 'bns') OR type = 'bonus' THEN amount ELSE 0 END), 0) as total_bonus,
        COALESCE(SUM(CASE WHEN type = 'bonus_loss' THEN amount ELSE 0 END), 0) as total_bonus_loss,
        COALESCE(SUM(CASE WHEN type = 'bonus_expired' THEN amount ELSE 0 END), 0) as total_bonus_expired
      FROM capital_flows
    `)

    // 净入金 = 真实入金 + 体验金 - 体验金亏损 - 出金
    // 体验金失效不计入净入金（赠金没了就是没了，但影响剩余体验金）
    const totalDeposit = Number(capitalStats[0].total_deposit)
    const totalWithdrawal = Number(capitalStats[0].total_withdrawal)
    const totalBonus = Number(capitalStats[0].total_bonus)
    const totalBonusLoss = Number(capitalStats[0].total_bonus_loss)
    const totalBonusExpired = Number(capitalStats[0].total_bonus_expired)

    const netCapital = totalDeposit + totalBonus - totalBonusLoss - totalWithdrawal
    const remainingBonus = Math.max(0, totalBonus - totalBonusLoss - totalBonusExpired)
    const netProfit = Number(tradeStats[0].net_profit)
    const equity = netCapital + remainingBonus + netProfit

    const [symbolDist] = await pool.query(`
      SELECT symbol,
        COUNT(*) as count,
        COALESCE(SUM(profit + commission + swap_fee), 0) as net_profit
      FROM trades
      GROUP BY symbol
      ORDER BY count DESC
    `)

    const winCount = tradeStats[0].win_count || 0
    const totalTrades = tradeStats[0].total_trades || 0
    const winRate = totalTrades > 0 ? (winCount / totalTrades * 100) : 0

    res.json({
      total_trades: totalTrades,
      win_count: winCount,
      loss_count: tradeStats[0].loss_count || 0,
      win_rate: Number(winRate.toFixed(2)),
      total_profit: Number(tradeStats[0].total_profit),
      total_commission: Number(tradeStats[0].total_commission),
      total_swap: Number(tradeStats[0].total_swap),
      net_profit: netProfit,
      total_deposit: Number(capitalStats[0].total_deposit),
      total_withdrawal: Number(capitalStats[0].total_withdrawal),
      total_bonus: totalBonus,
      total_bonus_loss: totalBonusLoss,
      total_bonus_expired: totalBonusExpired,
      remaining_bonus: remainingBonus,
      net_capital: netCapital,
      equity,
      symbol_distribution: symbolDist.map(s => ({
        symbol: s.symbol,
        count: s.count,
        net_profit: Number(s.net_profit)
      }))
    })
  } catch (err) {
    console.error('[stats] overview error:', err)
    res.status(500).json({ error: err.message })
  }
})

// 净值曲线（按日累计）— 返回完整日期序列含资金进出明细
router.get('/equity-curve', async (req, res) => {
  try {
    const [dailyTrades] = await pool.query(`
      SELECT trade_date as date,
        COUNT(*) as trades,
        COALESCE(SUM(profit), 0) as gross_profit,
        COALESCE(SUM(commission), 0) as commission,
        COALESCE(SUM(swap_fee), 0) as swap,
        COALESCE(SUM(profit + commission + swap_fee), 0) as daily_profit
      FROM trades
      GROUP BY trade_date
      ORDER BY trade_date
    `)

    const [dailyCapital] = await pool.query(`
      SELECT flow_date as date,
        COALESCE(SUM(CASE WHEN type = 'deposit' AND (remark IS NULL OR LEFT(remark, 3) <> 'bns') THEN amount ELSE 0 END), 0) as deposit,
        COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END), 0) as withdrawal,
        COALESCE(SUM(CASE WHEN (type = 'deposit' AND LEFT(remark, 3) = 'bns') OR type = 'bonus' THEN amount ELSE 0 END), 0) as bonus,
        COALESCE(SUM(CASE WHEN type = 'bonus_loss' THEN amount ELSE 0 END), 0) as bonus_loss,
        COALESCE(SUM(CASE WHEN type = 'bonus_expired' THEN amount ELSE 0 END), 0) as bonus_expired
      FROM capital_flows
      GROUP BY flow_date
      ORDER BY flow_date
    `)

    // 合并日期
    const dateMap = new Map()
    for (const t of dailyTrades) {
      if (!dateMap.has(t.date)) dateMap.set(t.date, { deposit: 0, withdrawal: 0, bonus: 0, bonus_loss: 0, bonus_expired: 0, trades: 0, daily_profit: 0 })
      const d = dateMap.get(t.date)
      d.trades = t.trades
      d.daily_profit = Number(t.daily_profit)
    }
    for (const c of dailyCapital) {
      if (!dateMap.has(c.date)) dateMap.set(c.date, { deposit: 0, withdrawal: 0, bonus: 0, bonus_loss: 0, bonus_expired: 0, trades: 0, daily_profit: 0 })
      const d = dateMap.get(c.date)
      d.deposit = Number(c.deposit)
      d.withdrawal = Number(c.withdrawal)
      d.bonus = Number(c.bonus)
      d.bonus_loss = Number(c.bonus_loss)
      d.bonus_expired = Number(c.bonus_expired)
    }

    const dates = [...dateMap.keys()].sort()
    let cumulativeCapital = 0
    let cumulativeBonus = 0
    let cumulativeProfit = 0
    const curve = dates.map(d => {
      const v = dateMap.get(d)
      // 净入金流 = deposit + bonus - bonus_loss - withdrawal（赠金失效不计入）
      const netCapitalFlow = v.deposit + v.bonus - v.bonus_loss - v.withdrawal
      cumulativeCapital += netCapitalFlow
      // 赠金独立累计，不能为负
      cumulativeBonus += v.bonus - v.bonus_loss - v.bonus_expired
      const remainingBonus = Math.max(0, cumulativeBonus)
      cumulativeProfit += v.daily_profit
      return {
        date: d,
        trades: v.trades,
        daily_profit: Number(v.daily_profit.toFixed(2)),
        deposit: v.deposit,
        withdrawal: v.withdrawal,
        bonus: v.bonus,
        bonus_loss: v.bonus_loss,
        bonus_expired: v.bonus_expired,
        net_capital_flow: Number(netCapitalFlow.toFixed(2)),
        net_capital: Number(cumulativeCapital.toFixed(2)),
        remaining_bonus: Number(remainingBonus.toFixed(2)),
        net_profit: Number(cumulativeProfit.toFixed(2)),
        equity: Number((cumulativeCapital + remainingBonus + cumulativeProfit).toFixed(2))
      }
    })

    res.json(curve)
  } catch (err) {
    console.error('[stats] equity-curve error:', err)
    res.status(500).json({ error: err.message })
  }
})

// 日历数据：按日统计（含胜率）
router.get('/calendar', async (req, res) => {
  try {
    const { year, month } = req.query
    let whereClause = ''
    const params = []

    if (year && month) {
      // month: 1-12
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const nextMonth = month == 12 ? 1 : Number(month) + 1
      const nextYear = month == 12 ? Number(year) + 1 : year
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
      whereClause = 'WHERE trade_date >= ? AND trade_date < ?'
      params.push(startDate, endDate)
    }

    const [rows] = await pool.query(`
      SELECT trade_date as date,
        COUNT(*) as trades,
        COALESCE(SUM(profit + commission + swap_fee), 0) as net_profit,
        SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) as losses,
        COALESCE(SUM(volume), 0) as total_volume
      FROM trades
      ${whereClause}
      GROUP BY trade_date
      ORDER BY trade_date
    `, params)

    res.json(rows.map(r => ({
      date: r.date,
      trades: r.trades,
      net_profit: Number(r.net_profit),
      wins: Number(r.wins),
      losses: Number(r.losses),
      win_rate: r.trades > 0 ? Number(((r.wins / r.trades) * 100).toFixed(1)) : 0,
      total_volume: Number(r.total_volume)
    })))
  } catch (err) {
    console.error('[stats] calendar error:', err)
    res.status(500).json({ error: err.message })
  }
})

// 按日交易统计
router.get('/daily', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT trade_date,
        COUNT(*) as trades,
        COALESCE(SUM(profit), 0) as gross_profit,
        COALESCE(SUM(commission), 0) as commission,
        COALESCE(SUM(swap_fee), 0) as swap,
        COALESCE(SUM(profit + commission + swap_fee), 0) as net_profit,
        SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) as losses
      FROM trades
      GROUP BY trade_date
      ORDER BY trade_date DESC
      LIMIT 90
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

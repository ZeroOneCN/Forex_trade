const ExcelJS = require('exceljs')
const crypto = require('crypto')

/**
 * 对齐 Python f"{float(v):.6g}" 格式化
 * 规则：6位有效数字，指数<-4或>=6用科学计数法，否则定点表示法，去掉尾部0
 */
function pythonG6(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (isNaN(n)) return ''
  if (n === 0) return '0'
  const abs = Math.abs(n)
  const exp = Math.floor(Math.log10(abs))
  if (exp < -4 || exp >= 6) {
    // 科学计数法，6位有效数字
    let s = n.toPrecision(6)
    // 去掉尾部0
    s = s.replace(/(\.\d*?)0+e/, '$1e')
    if (s.includes('.') && /e/.test(s) && s.indexOf('.') > s.indexOf('e')) {
      s = s.replace(/\./, '')
    }
    // 补零指数：JS "e+5" → Python "e+05"
    s = s.replace(/e([+-])(\d)$/, 'e$10$2')
    return s
  } else {
    // 定点表示法
    const decimals = Math.max(0, 5 - exp)
    let s = n.toFixed(decimals)
    // 去掉尾部0和小数点
    s = s.replace(/\.?0+$/, '')
    return s
  }
}

/**
 * 对齐 MT5 转换工具的交易去重 key 生成逻辑
 * Python dedup_key: position_id, 日期时间, 交易品种, 订单类型,
 *   开仓价格(.6g), 手数(.6g), 平仓价格(.6g), 开仓时间, 平仓时间
 */
function tradeDedupKey(t) {
  return [
    t.position_id == null ? '' : String(t.position_id),
    t.trade_date || '',
    t.symbol || '',
    t.order_type || '',
    pythonG6(t.open_price),
    pythonG6(t.volume),
    pythonG6(t.close_price),
    t.open_time || '',
    t.close_time || ''
  ].join('|')
}

/**
 * 从 key 生成稳定的 UUID-like ID
 */
function keyToId(key) {
  const hash = crypto.createHash('md5').update(key).digest('hex')
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`
}

// 交易表表头映射（中文 → 字段名）
const TRADE_HEADER_MAP = {
  'ID': 'id',
  '仓位ID': 'position_id',
  '日期时间': 'trade_date',
  '交易品种': 'symbol',
  '订单类型': 'order_type',
  '开仓价格': 'open_price',
  '手数': 'volume',
  '手续费': 'commission',
  '平仓价格': 'close_price',
  '盈亏金额': 'profit',
  '隔夜费': 'swap_fee',
  '开仓时间': 'open_time',
  '平仓时间': 'close_time',
  '持仓时间': 'holding_time',
  '备注': 'remark'
}

// 资金流水表头映射（未来 Sheet）
const CAPITAL_HEADER_MAP = {
  '日期': 'flow_date',
  '日期时间': 'flow_date',
  '类型': 'type',
  '金额': 'amount',
  '备注': 'remark'
}

/**
 * 安全提取单元格文本（处理富文本、公式结果等）
 */
function cellText(cell) {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if (v.result != null) return cellText({ value: v.result })
    if (v.richText) {
      return v.richText.map(rt => rt.text).join('').trim()
    }
    if (v.text) return String(v.text).trim()
    if (v.numFmt) return String(v.result != null ? v.result : '').trim()
  }
  return String(v).trim()
}

/**
 * 检测 Sheet 类型：通过表头判断是交易表还是资金表
 */
function detectSheetType(headers) {
  const headerSet = new Set(headers.map(h => String(h).trim()))
  // 资金表特征优先：包含「类型」和「金额」
  if (headerSet.has('类型') && headerSet.has('金额')) {
    return 'capital'
  }
  if ((headerSet.has('Type') || headerSet.has('type')) && (headerSet.has('Amount') || headerSet.has('amount'))) {
    return 'capital'
  }
  // 交易表特征1：包含「交易品种」和「仓位ID」
  if (headerSet.has('交易品种') && headerSet.has('仓位ID')) {
    return 'trade'
  }
  // 交易表特征2：包含「交易品种」（只有交易表有此列）
  if (headerSet.has('交易品种')) {
    return 'trade'
  }
  // 兼容英文表头
  if ((headerSet.has('Symbol') || headerSet.has('symbol')) && (headerSet.has('Position ID') || headerSet.has('position_id'))) {
    return 'trade'
  }
  return 'unknown'
}

/**
 * 构建行映射：表头 → 字段名
 */
function buildRowMap(headers, headerMap) {
  const map = {}
  headers.forEach((h, i) => {
    const key = String(h).trim()
    // 精确匹配 + 大小写不敏感匹配
    if (headerMap[key]) {
      map[i] = headerMap[key]
    } else {
      const lowerKey = key.toLowerCase()
      for (const [k, v] of Object.entries(headerMap)) {
        if (k.toLowerCase() === lowerKey) {
          map[i] = v
          break
        }
      }
    }
  })
  return map
}

/**
 * 格式化日期：处理 Excel 日期序列号和字符串
 */
function formatDate(val) {
  if (val == null || val === '') return null
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10)
  }
  const s = String(val).trim()
  // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  // Excel 日期序列号（1900 日期系统，数字 >= 1）
  const n = Number(s)
  if (!isNaN(n) && n >= 1 && n < 60000) {
    // Excel date serial → JS Date (Excel 从 1900-01-01 开始，有著名的 1900 闰年 bug)
    const excelEpoch = new Date(1899, 11, 30)
    const d = new Date(excelEpoch.getTime() + n * 86400000)
    return d.toISOString().slice(0, 10)
  }
  return s
}

/**
 * 格式化时间：处理 Excel 时间和字符串
 */
function formatTime(val) {
  if (val == null || val === '') return null
  if (val instanceof Date) {
    return val.toTimeString().slice(0, 8)
  }
  return String(val).trim()
}

/**
 * 格式化数字
 */
function formatNum(val) {
  if (val == null || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

/**
 * 标准化品种名称：去掉尾部的 + 号、后缀（如 .s、.S、.m、.M 等 MT5/经纪商标记）
 */
function normalizeSymbol(symbol) {
  if (!symbol) return ''
  let s = String(symbol).trim().toUpperCase()
  // 去掉尾部的 + 号
  s = s.replace(/\+$/, '')
  // 去掉尾部的 .X 后缀（单个字母的分类标记）
  s = s.replace(/\.[A-Z]$/, '')
  // 去掉尾部的 .XX 后缀（如 .SD、.SP 等）
  s = s.replace(/\.[A-Z]{1,2}$/, '')
  return s
}

/**
 * 从备注列提取 position_id（格式：ID:xxx | SL:yyy | TP:zzz）
 */
function extractPositionId(remark) {
  if (!remark) return null
  const match = String(remark).match(/ID[:\s]*(\d+)/i)
  return match ? match[1] : null
}

/**
 * 解析交易行
 */
function parseTradeRow(row, rowMap) {
  const obj = {}
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const fieldName = rowMap[colNumber - 1]
    if (!fieldName) return
    obj[fieldName] = cellText(cell)
  })

  if (!obj.symbol) return null

  // 优先使用仓位ID列，否则从备注列提取
  let positionId = null
  if (obj.position_id) {
    positionId = String(obj.position_id)
  } else if (obj.remark) {
    positionId = extractPositionId(obj.remark)
  }

  const rowData = {
    position_id: positionId,
    trade_date: formatDate(obj.trade_date),
    symbol: normalizeSymbol(obj.symbol),
    order_type: String(obj.order_type || '').trim().toLowerCase() === 'sell' ? 'sell' : 'buy',
    open_price: formatNum(obj.open_price),
    volume: formatNum(obj.volume),
    commission: formatNum(obj.commission) || 0,
    close_price: formatNum(obj.close_price),
    profit: formatNum(obj.profit) || 0,
    swap_fee: formatNum(obj.swap_fee) || 0,
    open_time: formatTime(obj.open_time),
    close_time: formatTime(obj.close_time),
    holding_time: obj.holding_time ? String(obj.holding_time).trim() : null,
    remark: obj.remark ? String(obj.remark).trim() : null
  }

  // 基于 MT5 转换工具 dedup_key 生成稳定 id
  const dedupKey = tradeDedupKey(rowData)
  const stableId = keyToId(dedupKey)
  return { id: stableId, dedup_key: dedupKey, ...rowData }
}

/**
 * 解析资金行
 */
function parseCapitalRow(row, rowMap) {
  const obj = {}
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const fieldName = rowMap[colNumber - 1]
    if (!fieldName) return
    obj[fieldName] = cellText(cell)
  })

  if (!obj.type && !obj.amount) return null

  const originalType = String(obj.type || '').trim()
  const amount = formatNum(obj.amount)
  if (!amount) return null

  // 判断资金类型（标准化用于存储）
  let normalizedType = originalType.toLowerCase()
  let normalizedAmount = Math.abs(amount)
  if (/失效|过期|expired/.test(originalType)) normalizedType = 'bonus_expired'
  else if (/亏损|扣除|loss/.test(originalType)) normalizedType = 'bonus_loss'
  else if (/存|入|deposit|充值/.test(originalType)) normalizedType = 'deposit'
  else if (/取|出|withdraw|提现/.test(originalType)) normalizedType = 'withdrawal'
  else if (/赠|奖|bonus|红|bns/.test(originalType)) {
    if (amount > 0) {
      normalizedType = 'bonus'
    } else {
      normalizedType = 'bonus_loss'
    }
  }

  const date = formatDate(obj.flow_date)
  const remark = obj.remark ? String(obj.remark).trim() : ''

  // 去重键：与数据库 initDB 重建逻辑一致
  // f"{日期}|{标准化类型}|{abs(金额).2f}|{备注}"
  const dedupKey = `${date}|${normalizedType}|${normalizedAmount.toFixed(2)}|${remark}`

  return {
    flow_date: date,
    type: normalizedType,
    amount: normalizedAmount,
    remark,
    dedup_key: dedupKey
  }
}

/**
 * 解析多 Sheet Excel 文件
 * @param {string} filePath - Excel 文件路径
 * @returns {{ trades: Array, capitalFlows: Array, sheets: Array }}
 */
async function parseExcel(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const trades = []
  const capitalFlows = []
  const sheets = []

  for (const worksheet of workbook.worksheets) {
    const headerRow = worksheet.getRow(1)
    const headers = []
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      headers.push(cellText(cell))
    })

    const sheetType = detectSheetType(headers)
    sheets.push({ name: worksheet.name, type: sheetType, rowCount: worksheet.rowCount - 1 })

    if (sheetType === 'trade') {
      const rowMap = buildRowMap(headers, TRADE_HEADER_MAP)
      for (let r = 2; r <= worksheet.rowCount; r++) {
        const parsed = parseTradeRow(worksheet.getRow(r), rowMap)
        if (parsed) trades.push(parsed)
      }
    } else if (sheetType === 'capital') {
      const rowMap = buildRowMap(headers, CAPITAL_HEADER_MAP)
      for (let r = 2; r <= worksheet.rowCount; r++) {
        const parsed = parseCapitalRow(worksheet.getRow(r), rowMap)
        if (parsed) capitalFlows.push(parsed)
      }
    }
  }

  return { trades, capitalFlows, sheets }
}

module.exports = { parseExcel, detectSheetType, pythonG6, tradeDedupKey, extractPositionId }

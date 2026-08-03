const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: options.body instanceof FormData
      ? undefined
      : { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

export const api = {
  // 统计
  getOverview: () => request('/stats/overview'),
  getEquityCurve: () => request('/stats/equity-curve'),
  getDaily: () => request('/stats/daily'),
  getCalendar: (year, month) => request(`/stats/calendar?year=${year}&month=${month}`),

  // 交易
  getTrades: (params) => request('/trades?' + new URLSearchParams(params)),
  importTrades: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return request('/trades/import', { method: 'POST', body: fd })
  },
  deleteTrade: (id) => request(`/trades/${id}`, { method: 'DELETE' }),
  downloadTemplate: () => `${BASE}/trades/template`,
  exportData: () => `${BASE}/trades/export`,

  // 资金
  getCapital: (params) => request('/capital?' + new URLSearchParams(params)),
  addCapital: (data) => request('/capital', { method: 'POST', body: JSON.stringify(data) }),
  deleteCapital: (id) => request(`/capital/${id}`, { method: 'DELETE' }),

  // 品种
  getSymbols: () => request('/symbols'),
  updateSymbol: (id, data) => request(`/symbols/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
}

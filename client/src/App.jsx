import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Calendar from './pages/Calendar'
import Calculator from './pages/Calculator'
import Capital from './pages/Capital'
import Insights from './pages/Insights'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trades" element={<Trades />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/calculator" element={<Calculator />} />
        <Route path="/capital" element={<Capital />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

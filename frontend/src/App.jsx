import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import CbuList from './pages/CbuList'
import CbuEditor from './pages/CbuEditor'
import CbuView from './pages/CbuView'
import Products from './pages/Products'
import ImportProducts from './pages/ImportProducts'
import MissingImages from './pages/MissingImages'
import DatabaseManager from './pages/DatabaseManager'

export default function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { background: '#1a1a2e', color: '#fff' } }} />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cbus" element={<CbuList />} />
          <Route path="/cbus/new" element={<CbuEditor />} />
          <Route path="/cbus/:id" element={<CbuView />} />
          <Route path="/cbus/:id/edit" element={<CbuEditor />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/import" element={<ImportProducts />} />
          <Route path="/products/missing-images" element={<MissingImages />} />
          <Route path="/database" element={<DatabaseManager />} />
        </Route>
      </Routes>
    </>
  )
}

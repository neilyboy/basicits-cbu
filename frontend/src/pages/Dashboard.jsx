import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FileStack, Package, Upload, ArrowRight, TrendingUp } from 'lucide-react'
import api from '../api'

export default function Dashboard() {
  const [stats, setStats] = useState({ cbuCount: 0, productCount: 0, categoryCount: 0 })
  const [recentCbus, setRecentCbus] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [cbusRes, categories] = await Promise.all([
        api.getCbus({ limit: 5 }),
        api.getCategories(),
      ])
      setRecentCbus(cbusRes.cbus || [])
      const productCount = categories.reduce((s, c) => s + (c.product_count || 0), 0)
      setStats({
        cbuCount: cbusRes.total || 0,
        productCount,
        categoryCount: categories.length,
      })
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
    }
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Basic ITS - Cost Build Up System</p>
        </div>
        <Link to="/cbus/new" className="flex items-center gap-2 bg-brand-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors">
          <Plus size={16} /> New CBU
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/cbus" className="bg-white rounded-xl p-5 border border-gray-200 hover:border-brand-300 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Cost Build Ups</p>
              <p className="text-3xl font-bold text-brand-900 mt-1">{stats.cbuCount}</p>
            </div>
            <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center group-hover:bg-brand-100 transition-colors">
              <FileStack size={22} className="text-brand-600" />
            </div>
          </div>
        </Link>
        <Link to="/products" className="bg-white rounded-xl p-5 border border-gray-200 hover:border-brand-300 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Products</p>
              <p className="text-3xl font-bold text-brand-900 mt-1">{stats.productCount}</p>
            </div>
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center group-hover:bg-green-100 transition-colors">
              <Package size={22} className="text-green-600" />
            </div>
          </div>
        </Link>
        <Link to="/products" className="bg-white rounded-xl p-5 border border-gray-200 hover:border-brand-300 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Categories</p>
              <p className="text-3xl font-bold text-brand-900 mt-1">{stats.categoryCount}</p>
            </div>
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center group-hover:bg-purple-100 transition-colors">
              <TrendingUp size={22} className="text-purple-600" />
            </div>
          </div>
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/cbus/new" className="bg-gradient-to-br from-brand-900 to-brand-800 text-white rounded-xl p-6 hover:shadow-lg transition-all">
          <h3 className="font-semibold text-lg flex items-center gap-2"><Plus size={20} /> Create New CBU</h3>
          <p className="text-sm text-gray-300 mt-2">Start a new cost build up for a client project</p>
        </Link>
        <Link to="/products/import" className="bg-gradient-to-br from-slate-700 to-slate-600 text-white rounded-xl p-6 hover:shadow-lg transition-all">
          <h3 className="font-semibold text-lg flex items-center gap-2"><Upload size={20} /> Import Products</h3>
          <p className="text-sm text-gray-300 mt-2">Import or update Verkada price book data</p>
        </Link>
      </div>

      {/* Recent CBUs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-brand-900">Recent Cost Build Ups</h2>
          <Link to="/cbus" className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1">
            View All <ArrowRight size={14} />
          </Link>
        </div>
        {recentCbus.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <FileStack size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No cost build ups yet. Create your first one!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentCbus.map((cbu) => (
              <Link key={cbu.id} to={`/cbus/${cbu.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{cbu.project_name}</p>
                  <p className="text-xs text-gray-500 truncate">{cbu.client_name || 'No client'} &bull; {cbu.item_count || 0} items</p>
                </div>
                <div className="text-right ml-4 shrink-0">
                  <p className="font-semibold text-sm">{fmt((cbu.items_total || 0) + (cbu.misc_total || 0))}</p>
                  <p className="text-xs text-gray-400">{new Date(cbu.updated_at).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

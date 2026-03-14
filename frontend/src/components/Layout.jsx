import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileStack, Package, Upload, Menu, X, ImageOff, Database } from 'lucide-react'
import { useState } from 'react'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/cbus', icon: FileStack, label: 'Cost Build Ups' },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/products/import', icon: Upload, label: 'Import Products' },
  { to: '/products/missing-images', icon: ImageOff, label: 'Missing Images' },
  { to: '/database', icon: Database, label: 'Database Manager' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-brand-900 text-white transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col`}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Basic ITS" className="h-8 w-auto" />
            <div>
              <h1 className="font-bold text-sm leading-tight">Basic ITS</h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Cost Build Up</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 text-xs text-gray-500">
          Basic ITS CBU v1.0
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100"
          >
            <Menu size={20} />
          </button>
          <div className="text-sm text-gray-500">
            {NAV_ITEMS.find(i => location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to)))?.label || 'Basic ITS CBU'}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

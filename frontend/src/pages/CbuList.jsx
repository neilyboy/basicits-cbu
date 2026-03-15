import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Folder, FolderPlus, ChevronRight, FileStack, Trash2, Edit, Eye, Download, Share2, Upload, MoreVertical, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { getExportUrl, getShareUrl } from '../api'
import { copyToClipboard } from '../utils/clipboard'

export default function CbuList() {
  const navigate = useNavigate()
  const [cbus, setCbus] = useState([])
  const [folders, setFolders] = useState([])
  const [search, setSearch] = useState('')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParent, setNewFolderParent] = useState(null)
  const [activeMenu, setActiveMenu] = useState(null)
  const [showImportCbu, setShowImportCbu] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 100 }
      if (selectedFolder) params.folder_id = selectedFolder
      if (search) params.search = search
      const [cbusRes, foldersRes] = await Promise.all([
        api.getCbus(params),
        api.getFolders(),
      ])
      setCbus(cbusRes.cbus || [])
      setTotal(cbusRes.total || 0)
      setFolders(foldersRes || [])
    } catch (err) {
      toast.error('Failed to load data')
    }
    setLoading(false)
  }, [selectedFolder, search])

  useEffect(() => { loadData() }, [loadData])

  // Debounced search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    try {
      await api.createFolder({ name: newFolderName.trim(), parent_id: newFolderParent })
      setNewFolderName('')
      setShowNewFolder(false)
      loadData()
      toast.success('Folder created')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDeleteFolder(id) {
    if (!confirm('Delete this folder? CBUs inside will be moved to the root.')) return
    try {
      await api.deleteFolder(id)
      if (selectedFolder === id) setSelectedFolder(null)
      loadData()
      toast.success('Folder deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDeleteCbu(id) {
    if (!confirm('Delete this CBU? This cannot be undone.')) return
    try {
      await api.deleteCbu(id)
      loadData()
      toast.success('CBU deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleShare(cbu) {
    const url = getShareUrl(cbu.share_id)
    const ok = await copyToClipboard(url)
    if (ok) toast.success('Share link copied to clipboard!')
    else toast.error('Could not copy — long-press the link to copy manually')
  }

  async function handleImportCbu(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const result = await api.importCbu(file)
      toast.success('CBU imported successfully')
      setShowImportCbu(false)
      loadData()
      navigate(`/cbus/${result.id}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  function renderFolderTree(items, depth = 0) {
    return items.map(folder => (
      <div key={folder.id}>
        <button
          onClick={() => setSelectedFolder(selectedFolder === folder.id ? null : folder.id)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
            selectedFolder === folder.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <Folder size={15} className={selectedFolder === folder.id ? 'text-brand-500' : 'text-gray-400'} />
          <span className="truncate flex-1 text-left">{folder.name}</span>
          <span className="text-xs text-gray-400">{folder.cbu_count || 0}</span>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"
          >
            <Trash2 size={12} />
          </button>
        </button>
        {folder.children && folder.children.length > 0 && renderFolderTree(folder.children, depth + 1)}
      </div>
    ))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-900">Cost Build Ups</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImportCbu(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <Upload size={15} /> Import CBU
          </button>
          <Link to="/cbus/new" className="flex items-center gap-1.5 bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
            <Plus size={15} /> New CBU
          </Link>
        </div>
      </div>

      {showImportCbu && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <Upload size={18} className="text-blue-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">Import a previously exported CBU (JSON format)</p>
            <input type="file" accept=".json" onChange={handleImportCbu} className="mt-2 text-sm" />
          </div>
          <button onClick={() => setShowImportCbu(false)} className="text-blue-400 hover:text-blue-600"><X size={18} /></button>
        </div>
      )}

      <div className="flex gap-4">
        {/* Folder sidebar */}
        <div className="w-56 shrink-0 hidden md:block">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Folders</h3>
              <button onClick={() => setShowNewFolder(true)} className="text-gray-400 hover:text-brand-600">
                <FolderPlus size={15} />
              </button>
            </div>

            <button
              onClick={() => setSelectedFolder(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                !selectedFolder ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileStack size={15} /> All CBUs
              <span className="ml-auto text-xs text-gray-400">{total}</span>
            </button>

            {renderFolderTree(folders)}

            {showNewFolder && (
              <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                <input
                  type="text"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-brand-500"
                  autoFocus
                />
                <div className="flex gap-1 mt-1.5">
                  <button onClick={handleCreateFolder} className="flex-1 bg-brand-900 text-white text-xs py-1 rounded hover:bg-brand-800">Create</button>
                  <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} className="flex-1 text-xs py-1 rounded border hover:bg-gray-100">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main list */}
        <div className="flex-1 min-w-0">
          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by project, client, description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : cbus.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <FileStack size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No cost build ups found</p>
              <Link to="/cbus/new" className="inline-flex items-center gap-2 mt-4 bg-brand-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-800">
                <Plus size={15} /> Create First CBU
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {cbus.map((cbu) => (
                <div key={cbu.id} className="bg-white rounded-xl border border-gray-200 hover:border-brand-200 hover:shadow-sm transition-all">
                  <div className="flex items-center p-4 gap-4">
                    <div className="flex-1 min-w-0">
                      <Link to={`/cbus/${cbu.id}`} className="font-semibold text-brand-900 hover:text-brand-600 transition-colors">
                        {cbu.project_name}
                      </Link>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {cbu.client_name && <span>{cbu.client_name}</span>}
                        {cbu.created_by && <span>&bull; {cbu.created_by}</span>}
                        <span>&bull; {cbu.item_count || 0} items</span>
                        {cbu.folder_name && (
                          <span className="flex items-center gap-1"><Folder size={11} />{cbu.folder_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg text-brand-900">{fmt((cbu.items_total || 0) + (cbu.misc_total || 0))}</p>
                      <p className="text-xs text-gray-400">{new Date(cbu.updated_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <Link to={`/cbus/${cbu.id}`} className="p-2.5 sm:p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-400 hover:text-brand-600" title="View">
                        <Eye size={16} />
                      </Link>
                      <Link to={`/cbus/${cbu.id}/edit`} className="p-2.5 sm:p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-400 hover:text-brand-600" title="Edit">
                        <Edit size={16} />
                      </Link>
                      <button onClick={() => handleShare(cbu)} className="p-2.5 sm:p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-400 hover:text-green-600" title="Share">
                        <Share2 size={16} />
                      </button>
                      <div className="relative">
                        <button onClick={() => setActiveMenu(activeMenu === cbu.id ? null : cbu.id)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                          <MoreVertical size={16} />
                        </button>
                        {activeMenu === cbu.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 w-48">
                              <a href={getExportUrl(cbu.id, 'pdf')} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50" target="_blank">
                                <Download size={14} /> Export PDF
                              </a>
                              <a href={getExportUrl(cbu.id, 'xlsx')} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                                <Download size={14} /> Export Excel
                              </a>
                              <a href={getExportUrl(cbu.id, 'csv')} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                                <Download size={14} /> Export CSV
                              </a>
                              <a href={getExportUrl(cbu.id, 'json')} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                                <Download size={14} /> Export JSON
                              </a>
                              <a href={getExportUrl(cbu.id, 'html')} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50" target="_blank">
                                <Eye size={14} /> View HTML
                              </a>
                              <hr className="my-1" />
                              <button onClick={() => { setActiveMenu(null); handleDeleteCbu(cbu.id) }} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full">
                                <Trash2 size={14} /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

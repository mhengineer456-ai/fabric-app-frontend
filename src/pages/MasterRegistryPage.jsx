import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../store.js';
import {
  Layers, Plus, Search, Trash2, Edit3,
  CheckCircle2, AlertTriangle, ShieldCheck, Download,
  Sparkles, Tag, Droplets, Users, Building,
  MapPin, Check, X, ArrowUpDown, ArrowLeft, LayoutGrid,
  List, Copy, Database, SlidersHorizontal, ChevronRight, Hash
} from 'lucide-react';
import * as XLSX from 'xlsx';
import '../Design/MasterRegistry.css';

const CATEGORIES = [
  { id: 'party', label: 'Party / Suppliers (CMF)', singular: 'Party', icon: Building, color: '#6366f1', desc: 'Fabric mills, CMF parties & vendors' },
  { id: 'fabric', label: 'Fabric Names', singular: 'Fabric Name', icon: Layers, color: '#3b82f6', desc: 'Standardized fabric types & knits' },
  { id: 'shade', label: 'Shades & Colors', singular: 'Shade / Color', icon: Droplets, color: '#ec4899', desc: 'Color names, shades & dye codes' },
  { id: 'person', label: 'Personnel & Operators', singular: 'Personnel / Operator', icon: Users, color: '#10b981', desc: 'Store operators & managers' },
  { id: 'category', label: 'Fabric Groups / Categories', singular: 'Fabric Group', icon: Tag, color: '#f59e0b', desc: 'Knitted, Woven, GSM groups' },
  { id: 'location', label: 'Warehouse Locations', singular: 'Location', icon: MapPin, color: '#06b6d4', desc: 'Aisles, racks & bin shelves' }
];

export default function MasterRegistryPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('party');
  const [items, setItems] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'
  const [sortField, setSortField] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    status: 'Active'
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Fast inline add bar
  const [quickName, setQuickName] = useState('');
  const [quickCode, setQuickCode] = useState('');
  const [quickDescription, setQuickDescription] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  // Toast notification
  const [toast, setToast] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load items for active tab and counts for all categories
  const loadData = async () => {
    setLoading(true);
    try {
      const [currentItems, allItems] = await Promise.all([
        store.getMasterItems(activeTab, '', statusFilter),
        store.getMasterItems('all', '', 'all')
      ]);

      setItems(Array.isArray(currentItems) ? currentItems : []);

      if (Array.isArray(allItems)) {
        const counts = {};
        CATEGORIES.forEach(c => {
          counts[c.id] = allItems.filter(i => i.type === c.id).length;
        });
        setCategoryCounts(counts);
      }
    } catch (err) {
      console.error('Error loading master items:', err);
      showToast('Failed to load master registry', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, statusFilter]);

  // Case-insensitive duplicate checking helper
  const checkDuplicate = (nameToCheck, excludeId = null) => {
    if (!nameToCheck || !nameToCheck.trim()) return null;
    const cleanNorm = nameToCheck.trim().replace(/\s+/g, ' ').toUpperCase();
    return items.find(item => {
      if (excludeId && String(item.id) === String(excludeId)) return false;
      const itemNorm = (item.normalizedName || item.name).trim().toUpperCase();
      return itemNorm === cleanNorm;
    });
  };

  // Filtered & Sorted items
  const displayItems = useMemo(() => {
    return items
      .filter(item => {
        if (!search.trim()) return true;
        const q = search.toLowerCase().trim();
        return (
          (item.name && item.name.toLowerCase().includes(q)) ||
          (item.code && item.code.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const valA = (a[sortField] || '').toString().toLowerCase();
        const valB = (b[sortField] || '').toString().toLowerCase();
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [items, search, sortField, sortAsc]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      status: 'Active'
    });
    setFormError('');
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      code: item.code || '',
      description: item.description || '',
      status: item.status || 'Active'
    });
    setFormError('');
    setModalOpen(true);
  };

  // Save Modal Form (Create / Edit)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Please enter a name.');
      return;
    }

    const cleanName = formData.name.trim().replace(/\s+/g, ' ');
    const existing = checkDuplicate(cleanName, editingItem?.id);

    if (existing) {
      setFormError(`⚠️ "${cleanName}" already exists (case-insensitive duplicate check)!`);
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      if (editingItem) {
        const res = await store.updateMasterItem(editingItem.id, {
          name: cleanName,
          code: formData.code.trim() || null,
          description: formData.description.trim() || null,
          status: formData.status
        });
        showToast(res.message || 'Master item updated successfully!', 'success');
      } else {
        const res = await store.addMasterItem({
          type: activeTab,
          name: cleanName,
          code: formData.code.trim() || null,
          description: formData.description.trim() || null,
          status: formData.status
        });
        showToast(res.message || 'New master item created!', 'success');
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to save master item');
    } finally {
      setSaving(false);
    }
  };

  // Quick Inline Add
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickName.trim()) return;

    const cleanName = quickName.trim().replace(/\s+/g, ' ');
    const existing = checkDuplicate(cleanName);

    if (existing) {
      showToast(`⚠️ "${cleanName}" already exists! Duplicates are strictly blocked.`, 'error');
      return;
    }

    setQuickSaving(true);
    try {
      const res = await store.addMasterItem({
        type: activeTab,
        name: cleanName,
        code: quickCode.trim() || null,
        description: quickDescription.trim() || null,
        status: 'Active'
      });
      showToast(res.message || `Added "${cleanName}" to ${currentCategory.label}!`, 'success');
      setQuickName('');
      setQuickCode('');
      setQuickDescription('');
      loadData();
    } catch (err) {
      showToast(err.message || 'Error creating item', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  // Toggle Item Status
  const handleToggleStatus = async (item) => {
    const newStatus = item.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await store.updateMasterItem(item.id, { status: newStatus });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
      showToast(`Status updated to ${newStatus}`, 'info');
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  // Delete Item
  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return;
    }

    try {
      await store.deleteMasterItem(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      setCategoryCounts(prev => ({ ...prev, [activeTab]: Math.max(0, (prev[activeTab] || 1) - 1) }));
      showToast(`Deleted "${item.name}" successfully!`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete item', 'error');
    }
  };

  // Copy to clipboard helper
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!displayItems.length) {
      showToast('No items to export', 'warning');
      return;
    }

    const exportData = displayItems.map((item, idx) => ({
      'S.No': idx + 1,
      'Category': currentCategory.label,
      'Item Name': item.name,
      'Code / Alias': item.code || '-',
      'Status': item.status,
      'Description': item.description || '-',
      'Standard Key': item.normalizedName || item.name.toUpperCase(),
      'Created Date': item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, currentCategory.label.substring(0, 31));
    XLSX.writeFile(wb, `Master_Registry_${activeTab.toUpperCase()}_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast(`Exported ${displayItems.length} items to Excel`, 'success');
  };

  // Helper for generating initial monogram
  const getInitials = (str) => {
    if (!str) return '??';
    const words = str.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  const currentCategory = CATEGORIES.find(c => c.id === activeTab) || CATEGORIES[0];
  const CurrentIcon = currentCategory.icon;

  const quickDupeMatch = checkDuplicate(quickName);
  const modalDupeMatch = checkDuplicate(formData.name, editingItem?.id);

  const totalAllItems = Object.values(categoryCounts).reduce((acc, c) => acc + (c || 0), 0);
  const activeCount = items.filter(i => i.status === 'Active').length;

  return (
    <div className="mr-studio-root">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 999999,
            padding: '12px 20px',
            borderRadius: '10px',
            background: toast.type === 'error' ? '#ef4444' : toast.type === 'warning' ? '#f59e0b' : '#10b981',
            color: 'white',
            fontWeight: '700',
            fontSize: '13.5px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'pulseDupe 0.2s ease-out'
          }}
        >
          {toast.type === 'error' ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="mr-top-bar">
        <div className="mr-top-bar-left">
          <button className="mr-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </button>
          <div className="mr-title-group">
            <h1>
              <Database size={22} style={{ color: '#2563eb' }} />
              Master Data Registry Studio
            </h1>
            <p>
              Standardize Parties, Fabrics, Shades & Dropdowns with Strict Duplicate Prevention
            </p>
          </div>
        </div>

        <div className="mr-top-bar-right">
          <div className="mr-shield-pill">
            <ShieldCheck size={16} />
            <span>Strict Duplicate Blocker ON</span>
          </div>

          <button className="mr-primary-btn" onClick={handleOpenCreate}>
            <Plus size={16} /> Add {currentCategory.singular}
          </button>
        </div>
      </div>

      {/* Split Studio Body */}
      <div className="mr-studio-body">
        {/* Left Navigator Rail */}
        <aside className="mr-categories-sidebar">
          <div>
            <div className="mr-nav-section-title">Master Categories</div>
            <div className="mr-category-list">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const isActive = activeTab === cat.id;
                const count = categoryCounts[cat.id] || 0;

                return (
                  <div
                    key={cat.id}
                    className={`mr-category-card ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab(cat.id);
                      setSearch('');
                    }}
                  >
                    <div className="mr-cat-left">
                      <div
                        className="mr-cat-icon-badge"
                        style={{
                          background: isActive ? cat.color : `${cat.color}15`,
                          color: isActive ? 'white' : cat.color
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="mr-cat-text-title">{cat.label}</div>
                        <div className="mr-cat-text-desc">{cat.desc}</div>
                      </div>
                    </div>

                    <span className="mr-cat-count-badge">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar Bottom Box */}
          <div className="mr-sidebar-footer-card">
            <h4>
              <Sparkles size={15} style={{ color: '#2563eb' }} />
              Clean Data Guarantee
            </h4>
            <p>
              Items created here populate all stock addition dropdowns automatically. Case-insensitive duplicates like "LYCRA SINKER" and "lycra sinker" cannot be created.
            </p>
          </div>
        </aside>

        {/* Right Main Content Pane */}
        <main className="mr-main-pane">
          {/* Active Category Header Card */}
          <div className="mr-category-header-banner">
            <div className="mr-banner-info">
              <div
                className="mr-big-icon-circle"
                style={{ background: currentCategory.color }}
              >
                <CurrentIcon size={24} />
              </div>
              <div className="mr-banner-text">
                <h2>{currentCategory.label}</h2>
                <p>{currentCategory.desc} · Standardized Master Registry</p>
              </div>
            </div>

            <div className="mr-banner-stats">
              <div className="mr-stat-chip">
                <div className="mr-stat-chip-num">{items.length}</div>
                <div className="mr-stat-chip-lbl">Total Items</div>
              </div>
              <div className="mr-stat-chip">
                <div className="mr-stat-chip-num" style={{ color: '#059669' }}>{activeCount}</div>
                <div className="mr-stat-chip-lbl">Active</div>
              </div>
            </div>
          </div>

          {/* Inline Quick Creator */}
          <div className={`mr-inline-creator ${quickDupeMatch ? 'has-dupe' : ''}`}>
            <div className="mr-creator-header">
              <div className="mr-creator-header-left">
                <Plus size={16} style={{ color: currentCategory.color }} />
                <span>Quick Register New {currentCategory.singular}</span>
              </div>
              <div className="mr-creator-header-right">
                Press Enter or click button to save
              </div>
            </div>

            <form onSubmit={handleQuickAdd}>
              <div className="mr-creator-grid">
                <div>
                  <input
                    type="text"
                    className={`mr-input ${quickDupeMatch ? 'input-dupe' : ''}`}
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder={`Type ${currentCategory.singular} name (e.g. ${activeTab === 'party' ? 'ABC TEXTILES' : activeTab === 'fabric' ? 'LYCRA SINKER' : activeTab === 'shade' ? 'NAVY BLUE' : 'JOHN DOE'})...`}
                  />
                  {quickDupeMatch && (
                    <div className="mr-dupe-warning-badge">
                      <AlertTriangle size={14} />
                      <span>Duplicate: "{quickName.trim()}" already registered as "{quickDupeMatch.name}"!</span>
                    </div>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    className="mr-input"
                    value={quickCode}
                    onChange={(e) => setQuickCode(e.target.value)}
                    placeholder="Code / Alias (Opt)"
                  />
                </div>

                <div>
                  <input
                    type="text"
                    className="mr-input"
                    value={quickDescription}
                    onChange={(e) => setQuickDescription(e.target.value)}
                    placeholder="Notes / Specs (Opt)"
                  />
                </div>

                <button
                  type="submit"
                  className="mr-submit-btn"
                  disabled={quickSaving || !quickName.trim() || !!quickDupeMatch}
                  style={{ background: currentCategory.color }}
                >
                  <Plus size={16} /> {quickSaving ? 'Saving...' : `Save ${currentCategory.singular}`}
                </button>
              </div>
            </form>
          </div>

          {/* Catalog Panel */}
          <div className="mr-catalog-panel">
            {/* Toolbar */}
            <div className="mr-catalog-toolbar">
              <div className="mr-search-box">
                <Search size={16} />
                <input
                  type="text"
                  className="mr-search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${items.length} ${currentCategory.label}...`}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  className="mr-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses ({items.length})</option>
                  <option value="Active">Active ({activeCount})</option>
                  <option value="Inactive">Inactive ({items.length - activeCount})</option>
                </select>

                <div style={{ display: 'flex', background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    style={{
                      background: viewMode === 'table' ? 'var(--hover-bg)' : 'transparent',
                      border: 'none',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: viewMode === 'table' ? '#2563eb' : 'var(--text-muted)'
                    }}
                    title="Table View"
                  >
                    <List size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    style={{
                      background: viewMode === 'grid' ? 'var(--hover-bg)' : 'transparent',
                      border: 'none',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: viewMode === 'grid' ? '#2563eb' : 'var(--text-muted)'
                    }}
                    title="Grid View"
                  >
                    <LayoutGrid size={16} />
                  </button>
                </div>

                <button className="mr-tool-btn" onClick={handleExportExcel}>
                  <Download size={14} /> Export Excel
                </button>
              </div>
            </div>

            {/* Table or Grid View */}
            {viewMode === 'table' ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="mr-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>#</th>
                      <th
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          if (sortField === 'name') setSortAsc(!sortAsc);
                          else { setSortField('name'); setSortAsc(true); }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{currentCategory.singular} Name</span>
                          <ArrowUpDown size={12} />
                        </div>
                      </th>
                      <th style={{ width: '140px' }}>Code / Alias</th>
                      <th style={{ width: '200px' }}>Standard Key (Unique)</th>
                      <th style={{ width: '130px' }}>Status</th>
                      <th style={{ width: '140px' }}>Created Date</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          Loading items...
                        </td>
                      </tr>
                    ) : displayItems.length === 0 ? (
                      <tr>
                        <td colSpan="7">
                          <div className="mr-empty-state">
                            <div className="mr-empty-icon" style={{ background: `${currentCategory.color}15`, color: currentCategory.color }}>
                              <CurrentIcon size={28} />
                            </div>
                            <div className="mr-empty-title">No {currentCategory.label} Found</div>
                            <div className="mr-empty-subtitle">
                              {search ? `No items matched "${search}".` : `Use the quick register bar above to add your first ${currentCategory.singular}.`}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayItems.map((item, idx) => {
                        const isActive = item.status === 'Active';
                        const monogram = getInitials(item.name);

                        return (
                          <tr key={item.id}>
                            <td style={{ color: 'var(--text-muted)', fontWeight: '700' }}>
                              {idx + 1}
                            </td>

                            <td>
                              <div className="mr-item-title-cell">
                                <div
                                  className="mr-item-monogram"
                                  style={{
                                    background: activeTab === 'shade'
                                      ? item.name.toLowerCase().includes('blue') ? '#2563eb' : item.name.toLowerCase().includes('red') ? '#ef4444' : item.name.toLowerCase().includes('green') ? '#10b981' : item.name.toLowerCase().includes('black') ? '#0f172a' : item.name.toLowerCase().includes('white') ? '#64748b' : currentCategory.color
                                      : currentCategory.color
                                  }}
                                >
                                  {activeTab === 'shade' ? <Droplets size={16} /> : monogram}
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="mr-item-name-text">{item.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(item.name, item.id)}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                                      title="Copy Name"
                                    >
                                      {copiedId === item.id ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                                    </button>
                                  </div>
                                  {item.description && (
                                    <div className="mr-item-notes">{item.description}</div>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td>
                              {item.code ? (
                                <span className="mr-code-badge">{item.code}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>

                            <td>
                              <code className="mr-key-badge">
                                {item.normalizedName || item.name.toUpperCase()}
                              </code>
                            </td>

                            <td>
                              <button
                                type="button"
                                className={`mr-status-pill ${isActive ? 'active' : 'inactive'}`}
                                onClick={() => handleToggleStatus(item)}
                                title="Click to toggle status"
                              >
                                <span className="mr-status-dot" />
                                <span>{item.status}</span>
                              </button>
                            </td>

                            <td style={{ color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                              {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                            </td>

                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="mr-action-btn"
                                  onClick={() => handleOpenEdit(item)}
                                  title="Edit"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="mr-action-btn btn-delete"
                                  onClick={() => handleDelete(item)}
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Grid View */
              <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {displayItems.map((item, idx) => {
                  const isActive = item.status === 'Active';
                  return (
                    <div
                      key={item.id}
                      style={{
                        background: 'var(--panel-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <button
                            type="button"
                            className={`mr-status-pill ${isActive ? 'active' : 'inactive'}`}
                            onClick={() => handleToggleStatus(item)}
                          >
                            <span className="mr-status-dot" />
                            <span>{item.status}</span>
                          </button>
                        </div>

                        <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '800' }}>{item.name}</h4>
                        {item.code && <span className="mr-code-badge" style={{ marginBottom: '6px', display: 'inline-block' }}>{item.code}</span>}
                        {item.description && <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{item.description}</p>}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                        <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.normalizedName}</code>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button type="button" className="mr-action-btn" onClick={() => handleOpenEdit(item)}>
                            <Edit3 size={13} />
                          </button>
                          <button type="button" className="mr-action-btn btn-delete" onClick={() => handleDelete(item)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              background: 'var(--panel-bg, #FFFFFF)',
              borderRadius: '16px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 24px',
                background: currentCategory.color,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CurrentIcon size={20} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                  {editingItem ? `Edit ${currentCategory.singular}` : `Create New ${currentCategory.singular}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} style={{ padding: '24px' }}>
              {formError && (
                <div className="mr-dupe-warning-badge" style={{ marginBottom: '16px' }}>
                  <AlertTriangle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              {formData.name.trim() && modalDupeMatch && !formError && (
                <div className="mr-dupe-warning-badge" style={{ marginBottom: '16px' }}>
                  <AlertTriangle size={16} />
                  <span>⚠️ Duplicate: "{formData.name.trim()}" already exists!</span>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', marginBottom: '6px' }}>
                  {currentCategory.singular} Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="mr-input"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, name: e.target.value }));
                    if (formError) setFormError('');
                  }}
                  placeholder={`e.g. ${activeTab === 'party' ? 'ABC TEXTILE MILLS' : activeTab === 'fabric' ? 'LYCRA SINKER' : 'ROYAL BLUE'}`}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', marginBottom: '6px' }}>
                  Code / Short Alias (Optional)
                </label>
                <input
                  type="text"
                  className="mr-input"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="e.g. LS-01"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', marginBottom: '6px' }}>
                  Description / Specification (Optional)
                </label>
                <textarea
                  rows="2"
                  className="mr-input"
                  style={{ resize: 'none' }}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Additional remarks..."
                />
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', marginBottom: '6px' }}>
                  Status
                </label>
                <select
                  className="mr-input"
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="Active">Active (Available in dropdowns)</option>
                  <option value="Inactive">Inactive (Hidden from dropdowns)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="mr-back-btn"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="mr-submit-btn"
                  disabled={saving || !formData.name.trim() || !!modalDupeMatch}
                  style={{ background: currentCategory.color }}
                >
                  {saving ? 'Saving...' : editingItem ? 'Update Master' : 'Create Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

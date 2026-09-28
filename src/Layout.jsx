import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { store } from './store.js';
import {
  Home, Package, Warehouse, PackagePlus, PackageMinus,
  ArrowLeftRight, BarChart3, Settings, ChevronDown,
  Search, Bell, Sun, Moon, Menu, LogOut, ChevronRight,
  Printer, Sparkles, Droplets, Grid, History, AlertCircle,
  Layers, Ruler, Scissors, FileText, Database, ClipboardList,
  ShieldCheck, Scale, FileSpreadsheet, Compass, HelpCircle, BookOpen,
  Activity, CheckCircle2, Award, User, Crown
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    category: 'Core Operations',
    items: [
      { path: '/', icon: Home, label: 'Dashboard Home' },
      { path: '/software-guide', icon: Compass, label: 'Software Guide' },
      { path: '/approvals', icon: ShieldCheck, label: 'Admin Approvals', badgeKey: 'pendingApprovals' },
    ]
  },
  {
    category: 'Inventory & Storage',
    items: [
      { path: '/materials', icon: Package, label: 'Material Master' },
      { path: '/old-inventory', icon: History, label: 'Old Inventory' },
      {
        label: 'Stock Add',
        icon: PackagePlus,
        children: [
          { path: '/fabric-sticker', icon: Printer, label: 'Material Add (Sticker)' },
          { path: '/dyeing-material-manual', icon: Scale, label: 'Dyeing Inward (Manual Weight)' },
          { path: '/dyeing-material', icon: Droplets, label: 'Dyeing Material (Auto Scale)' },
          { path: '/fabric-stock', icon: Ruler, label: 'Fabric Stock (Mtrs)' },
          { path: '/fabric-stock-kgs', icon: Scale, label: 'Fabric Stock (KGs)' },
          { path: '/material-against-po', icon: FileText, label: 'Material Against PO' },
          { path: '/fabric-po-audit', icon: Database, label: 'Fabric PO Audit' },
          { path: '/re-add-material', icon: Printer, label: 'Re Add Material In Stock' }
        ]
      },
      { path: '/recommendation', icon: Sparkles, label: 'Storage AI Rec' },
      { path: '/warehouse', icon: Warehouse, label: '3D Warehouse Layout' },
    ]
  },
  {
    category: 'Cutting & Issuance',
    items: [
      { path: '/grn', icon: PackagePlus, label: 'Material Receive (GRN)' },
      { path: '/issue', icon: Scissors, label: 'Material Issue', badge: '⚡ SCAN', badgeClass: 'badge-scan' },
      { path: '/transfer', icon: ArrowLeftRight, label: 'Material Transfer' },
      { path: '/parta', icon: Grid, label: 'Job Order Matrix' },
      { path: '/job-orders', icon: Layers, label: 'Job Orders' },
      { path: '/fabric-receiving-history', icon: History, label: 'Fabric Returns Log' },
      { path: '/reports/daily-fabric-issue', icon: FileText, label: 'Daily Fabric Issue' },
      { path: '/parta-pending', icon: AlertCircle, label: 'Pending in Parta' },
    ]
  },
  {
    category: 'Audit & Reports (MD Suite)',
    items: [
      { path: '/md-reports', icon: Crown, label: 'MD Daily Reports Hub' },
      {
        label: 'MD Sequenced Reports',
        icon: BarChart3,
        children: [
          { path: '/reports/daily-fabric-issue', icon: FileText, label: '1. Daily Fabric Issue' },
          { path: '/reports/daily-cutting-report', icon: Scissors, label: '2. Daily Cutting Report' },
          { path: '/reports/table-wise-classification', icon: Layers, label: '3. Table Classification' },
          { path: '/reports/daily-inventory/quantity-wise', icon: Package, label: '4. Inventory Quantity-Wise' },
          { path: '/reports/dyeing-shortage', icon: Droplets, label: '5. Dyeing Shortage Report' },
          { path: '/shortage-report-form', icon: FileSpreadsheet, label: '6. Shortage & QC Report' },
          { path: '/reports/daily-cutting/cutter-master', icon: Scissors, label: '7. Cutter Master Wise' },
          { path: '/reports/daily-cutting/supervisor', icon: FileText, label: '8. Supervisor Summary' },
          { path: '/reports/daily-cutting/hall', icon: Layers, label: '9. Hall Wise Cutting' },
          { path: '/fabric-po-audit', icon: Database, label: '10. Fabric PO Audit Log' }
        ]
      }
    ]
  },
  {
    category: 'System & Account',
    items: [
      { path: '/attendance', icon: ClipboardList, label: 'Attendance System' },
      { path: '/settings', icon: Settings, label: 'Settings' },
    ]
  }
];

export default function Layout({ children, darkMode, toggleDark, currentUser, handleLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState({ 'Stock Add': true, 'Reports & Audits': false });
  const [search, setSearch] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);
  const [stats, setStats] = useState({ rooms: 0, racks: 0, capacity: 0 });
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [pendingApprovalRequests, setPendingApprovalRequests] = useState([]);
  const [materials, setMaterials] = useState([]);

  const loadPendingData = async () => {
    try {
      const [transfersData, approvalReqs] = await Promise.all([
        store.getTransfers ? store.getTransfers() : Promise.resolve([]),
        store.getApprovalRequests ? store.getApprovalRequests() : Promise.resolve([])
      ]);
      setPendingTransfers((transfersData || []).filter(t => t.status === 'Pending'));

      const approvedTables = new Set(
        (approvalReqs || [])
          .filter(r => r.status === 'Approved')
          .map(r => r.tableNo ? r.tableNo.trim().toLowerCase() : '')
      );

      setPendingApprovalRequests(
        (approvalReqs || []).filter(r => 
          r.status === 'Pending' && 
          !approvedTables.has(r.tableNo ? r.tableNo.trim().toLowerCase() : '')
        )
      );
    } catch (e) {
      console.error('Error loading pending data:', e);
    }
  };

  useEffect(() => {
    loadPendingData();
    const interval = setInterval(loadPendingData, 30000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleApprove = async (id) => {
    try {
      await store.approveTransfer(id);
      loadPendingData();
    } catch (e) {
      alert(e.message || 'Error approving transfer');
    }
  };

  const handleReject = async (id) => {
    try {
      await store.rejectTransfer(id);
      loadPendingData();
    } catch (e) {
      alert(e.message || 'Error rejecting transfer');
    }
  };

  const handleRespondApproval = async (id, status) => {
    try {
      await store.respondApprovalRequest(id, status, currentUser?.name || 'Admin');
      loadPendingData();
    } catch (e) {
      alert(e.message || 'Error responding to approval request');
    }
  };

  const getMaterialName = (id) => {
    return materials.find(m => m.id === id)?.name || '—';
  };

  useEffect(() => {
    let active = true;
    const loadStats = async () => {
      try {
        const [loadedRooms, loadedRacks, shelves] = await Promise.all([
          store.getRooms ? store.getRooms() : Promise.resolve([]),
          store.getRacks ? store.getRacks() : Promise.resolve([]),
          store.getShelves ? store.getShelves() : Promise.resolve([])
        ]);
        if (!active) return;
        const capacity = (shelves || []).reduce((sum, s) => sum + (s.capacity || 0), 0);
        setStats({
          rooms: (loadedRooms || []).length || 2,
          racks: (loadedRacks || []).length || 36,
          capacity: capacity || 180
        });
      } catch (e) {
        console.error(e);
      }
    };
    loadStats();
    return () => { active = false; };
  }, [location.pathname]);

  const toggleMenu = (label) => setOpenMenus(o => ({ ...o, [label]: !o[label] }));

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className={`app-layout ${darkMode ? 'dark' : ''}`}>
      {/* ── ULTRA-MODERN SIDEBAR ── */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        
        {/* Brand & Logo Header */}
        <div className="sidebar-logo" onClick={() => navigate('/')}>
          <div className="logo-icon-wrapper">
            <div className="logo-icon-sparkle" />
            <span className="logo-icon-text">TW</span>
          </div>
          {!collapsed && (
            <div className="logo-text-group">
              <div className="logo-title-row">
                <span className="logo-brand-title">Textile Warehouse</span>
              </div>
              <div className="logo-sub-row">
                <span className="logo-sub-badge">ERP HUB</span>
                <span className="logo-version-tag">v2.5 Live</span>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Nav Items with Categorized Sections */}
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((sec, secIdx) => {
            // Filter items based on user role
            const visibleItems = sec.items.filter(item => {
              if (item.path === '/parta-pending') return currentUser?.role !== 'Admin';
              if (item.path === '/settings') return currentUser?.role === 'Admin';
              return true;
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={sec.category} className="nav-section-group">
                {!collapsed && (
                  <div className="nav-section-category-header">
                    <span>{sec.category}</span>
                    <span className="section-header-line" />
                  </div>
                )}

                {visibleItems.map(item => {
                  if (item.children) {
                    const open = openMenus[item.label];
                    const active = item.children.some(c => {
                      if (c.children) {
                        return c.children.some(gc => location.pathname === gc.path) || (c.path && location.pathname.startsWith(c.path));
                      }
                      return c.path && location.pathname.startsWith(c.path);
                    }) || (item.path && location.pathname.startsWith(item.path));

                    return (
                      <div key={item.label} className="nav-tree-group">
                        <div
                          className={`nav-item ${active ? 'active' : ''} ${open ? 'open' : ''}`}
                          onClick={() => toggleMenu(item.label)}
                          title={collapsed ? item.label : ''}
                        >
                          <span className="nav-icon"><item.icon size={17} /></span>
                          {!collapsed && <span className="nav-item-label">{item.label}</span>}
                          
                          {!collapsed && item.badge && (
                            <span className={`nav-item-badge ${item.badgeClass || ''}`}>{item.badge}</span>
                          )}

                          {!collapsed && <ChevronDown size={14} className="nav-chevron" />}
                        </div>

                        {open && !collapsed && (
                          <div className="nav-submenu">
                            {item.children.map(child => {
                              if (child.children) {
                                const childOpen = openMenus[child.label];
                                const childActive = child.children.some(gc => location.pathname === gc.path);
                                return (
                                  <div key={child.label} className="nav-subtree-group">
                                    <div
                                      className={`nav-item sub-item ${childActive ? 'active' : ''} ${childOpen ? 'open' : ''}`}
                                      onClick={() => toggleMenu(child.label)}
                                    >
                                      <span className="nav-icon">{child.icon && <child.icon size={14} />}</span>
                                      <span className="nav-item-label">{child.label}</span>
                                      <ChevronDown size={12} className="nav-chevron" />
                                    </div>
                                    {childOpen && (
                                      <div className="nav-sub-submenu">
                                        {child.children.map(grandchild => (
                                          <div
                                            key={grandchild.path}
                                            className={`nav-item grand-sub-item ${location.pathname === grandchild.path ? 'active' : ''}`}
                                            onClick={() => navigate(grandchild.path)}
                                          >
                                            <span className="nav-dot" />
                                            <span className="nav-item-label">{grandchild.label}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={child.path}
                                  className={`nav-item sub-item ${location.pathname === child.path ? 'active' : ''}`}
                                  onClick={() => navigate(child.path)}
                                >
                                  <span className="nav-icon"><child.icon size={14} /></span>
                                  <span className="nav-item-label">{child.label}</span>
                                  {child.badge && (
                                    <span className={`nav-item-badge ${child.badgeClass || ''}`}>{child.badge}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Single direct nav item
                  return (
                    <div
                      key={item.path}
                      className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                      onClick={() => navigate(item.path)}
                      title={collapsed ? item.label : ''}
                    >
                      <span className="nav-icon"><item.icon size={17} /></span>
                      {!collapsed && <span className="nav-item-label">{item.label}</span>}
                      
                      {!collapsed && item.badgeKey === 'pendingApprovals' && pendingApprovalRequests.length > 0 && (
                        <span className="nav-item-badge badge-pending-pulse">
                          {pendingApprovalRequests.length}
                        </span>
                      )}

                      {!collapsed && item.badge && (
                        <span className={`nav-item-badge ${item.badgeClass || ''}`}>{item.badge}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer Mini Card */}
        <div className="sidebar-footer">
          {!collapsed && (
            <div className="sidebar-storage-widget">
              <div className="widget-header-row">
                <span className="widget-title">Warehouse Grid</span>
                <span className="widget-status-online">● Online</span>
              </div>
              <div className="widget-stat-row">
                <span>Racks / Shelves:</span>
                <span className="widget-stat-val">{stats.racks} Rks · {stats.capacity} Shvs</span>
              </div>
              <div className="widget-bar-track">
                <div className="widget-bar-fill" style={{ width: '86%' }} />
              </div>
            </div>
          )}

          {/* User Profile / Logout Strip */}
          <div className="sidebar-user-strip">
            <div className="user-avatar-circle">
              <User size={15} />
            </div>
            {!collapsed && (
              <div className="user-info-text">
                <div className="user-name-title">{currentUser?.name || 'paras3105'}</div>
                <div className="user-role-sub">{currentUser?.role || 'Store Operator'}</div>
              </div>
            )}
            <button
              className="sidebar-logout-btn"
              onClick={handleLogout}
              title="Logout Session"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── TOPBAR & MAIN CONTENT ── */}
      <div className="main-wrapper">
        <header className="topbar">
          <div className="topbar-left">
            <button className="topbar-toggle" onClick={() => setCollapsed(c => !c)} id="sidebar-toggle-btn">
              <Menu size={18} />
            </button>
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search materials, codes, locations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && search) {
                    navigate(`/materials?search=${encodeURIComponent(search)}`);
                  }
                }}
              />
            </div>
          </div>

          <div className="topbar-right">
            {/* Topbar Software Guide Button */}
            <button
              className="topbar-guide-btn"
              onClick={() => navigate('/software-guide')}
              title="Open Animated Interactive Software Guide"
            >
              <Compass size={16} className="guide-btn-icon" />
              <span className="guide-btn-text">Software Guide</span>
              <span className="guide-btn-tag">HOW IT WORKS</span>
            </button>

            {/* Dark Mode Toggle */}
            <button className="theme-toggle" onClick={toggleDark} title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* Notifications */}
            <div style={{ position: 'relative' }}>
              <button className="theme-toggle" onClick={() => setShowNotifs(!showNotifs)} title="Notifications">
                <Bell size={17} />
                {(pendingTransfers.length > 0 || pendingApprovalRequests.length > 0) && (
                  <span className="notif-badge">
                    {pendingTransfers.length + pendingApprovalRequests.length}
                  </span>
                )}
              </button>

              {/* Notification Popover */}
              {showNotifs && (
                <div className="notif-popover">
                  <div className="notif-header">
                    <h4>Notifications</h4>
                    <span>{pendingTransfers.length + pendingApprovalRequests.length} Pending</span>
                  </div>

                  {pendingTransfers.length === 0 && pendingApprovalRequests.length === 0 ? (
                    <div style={{ padding: 16, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
                      No pending requests
                    </div>
                  ) : (
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                      {pendingTransfers.map(t => (
                        <div key={t.id} className="notif-item">
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <strong>Transfer: {getMaterialName(t.materialId)}</strong>
                            <span style={{ fontSize: 11, color: '#64748b' }}>Qty: {t.quantity}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                            From {t.fromLocation} ➔ To {t.toLocation}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleApprove(t.id)}>
                              Approve
                            </button>
                            <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleReject(t.id)}>
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}

                      {pendingApprovalRequests.map(r => (
                        <div key={r.id} className="notif-item" style={{ borderLeft: '3px solid #f59e0b' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <strong>Table Override: {r.tableNo}</strong>
                            <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 'bold' }}>Pending</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                            Job: {r.jobOrder} (Lot: {r.lotNumber})
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                            Requested by: {r.requestedBy}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: 11, background: '#10b981', borderColor: '#10b981' }} onClick={() => handleRespondApproval(r.id, 'Approved')}>
                              Approve
                            </button>
                            <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => handleRespondApproval(r.id, 'Rejected')}>
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Profile */}
            <div className="user-profile-top">
              <div className="avatar">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="user-info">
                <div className="name">{currentUser?.name || 'User'}</div>
                <div className="role">{currentUser?.role || 'Operator'}</div>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="page-content">
          {children}
        </main>
      </div>

      <style>{`
        /* ==========================================================================
           ULTRA-MODERN APP LAYOUT & SIDEBAR STYLING
           ========================================================================== */
        .app-layout {
          display: flex !important;
          width: 100vw !important;
          height: 100vh !important;
          overflow: hidden !important;
          background: #f8fafc !important;
        }
        .dark.app-layout, .dark .app-layout {
          background: #0b132b !important;
        }

        .main-wrapper {
          flex: 1 !important;
          display: flex !important;
          flex-direction: column !important;
          height: 100vh !important;
          overflow: hidden !important;
          min-width: 0 !important;
        }

        /* ── NAVBAR / TOPBAR ── */
        .topbar {
          height: 64px !important;
          min-height: 64px !important;
          background: #ffffff !important;
          border-bottom: 1px solid #e2e8f0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          padding: 0 24px !important;
          gap: 16px !important;
          width: 100% !important;
          box-sizing: border-box !important;
          z-index: 50 !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
        }
        .dark .topbar {
          background: #0f172a !important;
          border-bottom-color: #334155 !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3) !important;
        }

        .topbar-left {
          display: flex !important;
          align-items: center !important;
          gap: 16px !important;
          flex: 1 !important;
          max-width: 500px !important;
        }

        .topbar-toggle {
          width: 38px !important;
          height: 38px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 9px !important;
          border: 1px solid #e2e8f0 !important;
          background: #f8fafc !important;
          color: #475569 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          flex-shrink: 0 !important;
        }
        .dark .topbar-toggle {
          background: #1e293b !important;
          border-color: #334155 !important;
          color: #94a3b8 !important;
        }
        .topbar-toggle:hover {
          background: #2563eb !important;
          color: #ffffff !important;
          border-color: #2563eb !important;
        }

        .search-box {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          width: 100% !important;
          background: #f8fafc !important;
          border: 1.5px solid #e2e8f0 !important;
          border-radius: 24px !important;
          padding: 7px 16px 7px 38px !important;
          transition: all 0.2s ease !important;
        }
        .dark .search-box {
          background: #1e293b !important;
          border-color: #334155 !important;
        }
        .search-box:focus-within {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
        }
        .dark .search-box:focus-within {
          background: #0f172a !important;
        }
        .search-box .search-icon {
          position: absolute !important;
          left: 14px !important;
          color: #94a3b8 !important;
          pointer-events: none !important;
        }
        .search-box input {
          width: 100% !important;
          border: none !important;
          background: transparent !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          color: #0f172a !important;
          outline: none !important;
        }
        .dark .search-box input {
          color: #f8fafc !important;
        }
        .search-box input::placeholder {
          color: #94a3b8 !important;
        }

        .topbar-right {
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          margin-left: auto !important;
        }

        .theme-toggle {
          width: 38px !important;
          height: 38px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 9px !important;
          border: 1px solid #e2e8f0 !important;
          background: #f8fafc !important;
          color: #475569 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          position: relative !important;
        }
        .dark .theme-toggle {
          background: #1e293b !important;
          border-color: #334155 !important;
          color: #94a3b8 !important;
        }
        .theme-toggle:hover {
          background: #e2e8f0 !important;
          color: #0f172a !important;
        }
        .dark .theme-toggle:hover {
          background: #334155 !important;
          color: #f8fafc !important;
        }

        .notif-badge {
          position: absolute !important;
          top: -4px !important;
          right: -4px !important;
          background: #ef4444 !important;
          color: #ffffff !important;
          font-size: 10px !important;
          font-weight: 800 !important;
          padding: 1px 5px !important;
          border-radius: 10px !important;
          border: 2px solid #ffffff !important;
        }
        .dark .notif-badge {
          border-color: #0f172a !important;
        }

        .notif-popover {
          position: absolute !important;
          right: 0 !important;
          top: calc(100% + 10px) !important;
          width: 340px !important;
          background: #ffffff !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15) !important;
          z-index: 1000 !important;
          overflow: hidden !important;
        }
        .dark .notif-popover {
          background: #1e293b !important;
          border-color: #334155 !important;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4) !important;
        }
        .notif-header {
          padding: 12px 16px !important;
          background: #f8fafc !important;
          border-bottom: 1px solid #e2e8f0 !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
        }
        .dark .notif-header {
          background: #0f172a !important;
          border-bottom-color: #334155 !important;
        }
        .notif-header h4 {
          margin: 0 !important;
          font-size: 13px !important;
          font-weight: 750 !important;
          color: #0f172a !important;
        }
        .dark .notif-header h4 {
          color: #f8fafc !important;
        }
        .notif-header span {
          font-size: 11px !important;
          color: #ef4444 !important;
          font-weight: 700 !important;
        }
        .notif-item {
          padding: 12px 16px !important;
          border-bottom: 1px solid #f1f5f9 !important;
        }
        .dark .notif-item {
          border-bottom-color: #334155 !important;
        }

        .user-profile-top {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 4px 12px 4px 6px !important;
          border-radius: 24px !important;
          background: #f8fafc !important;
          border: 1.5px solid #e2e8f0 !important;
          cursor: default !important;
        }
        .dark .user-profile-top {
          background: #1e293b !important;
          border-color: #334155 !important;
        }
        .user-profile-top .avatar {
          width: 30px !important;
          height: 30px !important;
          border-radius: 50% !important;
          background: linear-gradient(135deg, #4338ca 0%, #2563eb 100%) !important;
          color: #ffffff !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 12px !important;
          font-weight: 800 !important;
        }
        .user-profile-top .user-info {
          display: flex !important;
          flex-direction: column !important;
        }
        .user-profile-top .name {
          font-size: 12.5px !important;
          font-weight: 800 !important;
          color: #0f172a !important;
          line-height: 1.2 !important;
        }
        .dark .user-profile-top .name {
          color: #f8fafc !important;
        }
        .user-profile-top .role {
          font-size: 10.5px !important;
          color: #64748b !important;
          font-weight: 600 !important;
        }
        .dark .user-profile-top .role {
          color: #94a3b8 !important;
        }

        /* ── PAGE CONTENT CONTAINER ── */
        .page-content {
          flex: 1 !important;
          overflow-y: auto !important;
          padding: 24px 32px !important;
          background: #f8fafc !important;
        }
        .dark .page-content {
          background: #0b132b !important;
        }

        /* ── ULTRA-ENHANCED SIDEBAR & LINK STYLING ── */
        .sidebar {
          background: linear-gradient(180deg, #090F22 0%, #0F172A 100%) !important; /* Deep Luxury High-Contrast Slate */
          border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
          display: flex !important;
          flex-direction: column !important;
          transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1) !important;
          width: var(--sidebar-width, 285px) !important;
          height: 100vh !important;
          position: sticky !important;
          top: 0 !important;
          overflow-y: hidden !important;
          z-index: 100 !important;
          box-shadow: 4px 0 20px rgba(0, 0, 0, 0.25) !important;
        }
        .dark .sidebar {
          background: linear-gradient(180deg, #050B18 0%, #0B132B 100%) !important;
          border-right-color: rgba(255, 255, 255, 0.08) !important;
        }

        .sidebar.collapsed {
          width: 76px !important;
        }

        .sidebar-logo {
          padding: 20px 18px !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.09) !important;
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          background: rgba(255, 255, 255, 0.03) !important;
          cursor: pointer !important;
          transition: background 0.2s ease !important;
        }
        .sidebar-logo:hover {
          background: rgba(255, 255, 255, 0.06) !important;
        }

        .logo-icon-wrapper {
          position: relative !important;
          width: 42px !important;
          height: 42px !important;
          background: linear-gradient(135deg, #4338CA 0%, #2563EB 50%, #06B6D4 100%) !important;
          border-radius: 12px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 4px 16px rgba(37, 99, 235, 0.45) !important;
          flex-shrink: 0 !important;
        }
        .logo-icon-text {
          color: #FFFFFF !important;
          font-weight: 900 !important;
          font-size: 17px !important;
          letter-spacing: -0.5px !important;
        }
        .logo-icon-sparkle {
          position: absolute !important;
          top: -2px !important;
          right: -2px !important;
          width: 9px !important;
          height: 9px !important;
          border-radius: 50%;
          background: #10B981;
          box-shadow: 0 0 10px #10B981;
          border: 1.5px solid #090F22;
        }

        .logo-text-group {
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }
        .logo-brand-title {
          color: #FFFFFF !important;
          font-size: 15px !important;
          font-weight: 900 !important;
          letter-spacing: 0.3px !important;
          white-space: nowrap !important;
        }
        .logo-sub-row {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          margin-top: 3px !important;
        }
        .logo-sub-badge {
          font-size: 9.5px !important;
          font-weight: 850 !important;
          background: rgba(37, 99, 235, 0.3) !important;
          color: #93C5FD !important;
          padding: 2px 6px !important;
          border-radius: 5px !important;
          letter-spacing: 0.5px !important;
          border: 1px solid rgba(59, 130, 246, 0.3) !important;
        }
        .logo-version-tag {
          font-size: 10px !important;
          color: #94A3B8 !important;
          font-weight: 700 !important;
        }

        .sidebar-nav {
          flex: 1 !important;
          overflow-y: auto !important;
          padding: 14px 10px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 16px !important;
        }
        .sidebar-nav::-webkit-scrollbar {
          width: 5px !important;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.18) !important;
          border-radius: 5px !important;
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3) !important;
        }

        .nav-section-group {
          display: flex !important;
          flex-direction: column !important;
          gap: 3px !important;
        }

        .nav-section-category-header {
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          padding: 6px 12px 6px !important;
          font-size: 10.5px !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
          color: #94A3B8 !important;
          font-weight: 850 !important;
        }
        .section-header-line {
          flex: 1 !important;
          height: 1px !important;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.12) 0%, transparent 100%) !important;
        }

        /* ── HIGH VISIBILITY NAV ITEM LINK ── */
        .nav-item {
          display: flex !important;
          align-items: center !important;
          padding: 10px 14px !important;
          color: #E2E8F0 !important; /* Crisp, bright, high-contrast text */
          border-radius: 10px !important;
          font-size: 13.5px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
          text-decoration: none !important;
          position: relative !important;
          border: 1px solid transparent !important;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.09) !important;
          color: #FFFFFF !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
          transform: translateX(4px) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
        }

        .nav-item:hover .nav-icon {
          color: #60A5FA !important;
          transform: scale(1.1) !important;
        }

        .nav-item.active {
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%) !important;
          color: #FFFFFF !important;
          box-shadow: 0 4px 18px rgba(37, 99, 235, 0.45) !important;
          font-weight: 800 !important;
          border: 1px solid rgba(147, 197, 253, 0.4) !important;
        }

        .nav-item.active .nav-icon {
          color: #FFFFFF !important;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3)) !important;
        }

        .nav-icon {
          margin-right: 12px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          color: #93C5FD !important; /* Soft vibrant blue tint by default for clear recognition */
          flex-shrink: 0 !important;
          opacity: 1 !important;
          transition: transform 0.2s ease, color 0.2s ease !important;
        }

        .nav-item-label {
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          flex: 1 !important;
          letter-spacing: 0.2px !important;
        }

        .nav-chevron {
          margin-left: 6px !important;
          transition: transform 0.22s ease !important;
          color: #94A3B8 !important;
          flex-shrink: 0 !important;
        }
        .nav-item:hover .nav-chevron {
          color: #FFFFFF !important;
        }
        .nav-item.open .nav-chevron {
          transform: rotate(180deg) !important;
          color: #60A5FA !important;
        }

        .nav-item-badge {
          font-size: 10px !important;
          font-weight: 850 !important;
          padding: 2px 7px !important;
          border-radius: 6px !important;
          margin-left: auto !important;
          white-space: nowrap !important;
          background: rgba(255, 255, 255, 0.15) !important;
          color: #F8FAFC !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          letter-spacing: 0.3px !important;
        }
        .badge-tour {
          background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%) !important;
          color: #FFFFFF !important;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4) !important;
          border-color: #FBBF24 !important;
        }
        .badge-scan {
          background: #059669 !important;
          color: #FFFFFF !important;
          border-color: #34D399 !important;
        }
        .badge-ai {
          background: #7C3AED !important;
          color: #FFFFFF !important;
          border-color: #A78BFA !important;
        }
        .badge-qc {
          background: #0284C7 !important;
          color: #FFFFFF !important;
          border-color: #38BDF8 !important;
        }
        .badge-pending-pulse {
          background: #DC2626 !important;
          color: #FFFFFF !important;
          border-color: #F87171 !important;
          animation: pulseRedBadge 1.5s infinite !important;
        }

        /* ── SUBMENU & NESTED TREE VISIBILITY ── */
        .nav-submenu {
          margin: 3px 0 6px 16px !important;
          padding-left: 12px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 3px !important;
          border-left: 2px solid rgba(59, 130, 246, 0.35) !important; /* Prominent accent line */
        }

        .nav-item.sub-item {
          padding: 8px 12px !important;
          font-size: 12.5px !important;
          font-weight: 700 !important;
          color: #CBD5E1 !important;
          border-radius: 8px !important;
        }
        .nav-item.sub-item:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #FFFFFF !important;
          transform: translateX(3px) !important;
        }
        .nav-item.sub-item.active {
          background: rgba(37, 99, 235, 0.28) !important;
          color: #93C5FD !important;
          border: 1.5px solid rgba(96, 165, 250, 0.5) !important;
          box-shadow: 0 2px 10px rgba(37, 99, 235, 0.2) !important;
          font-weight: 850 !important;
        }
        .nav-item.sub-item.active .nav-icon {
          color: #60A5FA !important;
        }

        .nav-sub-submenu {
          margin: 3px 0 4px 12px !important;
          padding-left: 12px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 2px !important;
          border-left: 1.5px dashed rgba(59, 130, 246, 0.25) !important;
        }

        .nav-item.grand-sub-item {
          padding: 6px 10px !important;
          font-size: 12px !important;
          color: #CBD5E1 !important;
          gap: 8px !important;
          font-weight: 650 !important;
        }
        .nav-dot {
          width: 5px !important;
          height: 5px !important;
          border-radius: 50% !important;
          background: #64748B !important;
          transition: all 0.2s ease !important;
        }
        .nav-item.grand-sub-item:hover .nav-dot {
          background: #60A5FA !important;
          transform: scale(1.3) !important;
        }
        .nav-item.grand-sub-item.active .nav-dot {
          background: #38BDF8 !important;
          box-shadow: 0 0 8px #38BDF8 !important;
        }
        .nav-item.grand-sub-item.active {
          color: #38BDF8 !important;
          font-weight: 850 !important;
        }

        .sidebar-footer {
          margin-top: auto !important;
          padding: 14px 12px !important;
          border-top: 1px solid rgba(255, 255, 255, 0.09) !important;
          background: rgba(0, 0, 0, 0.3) !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
        }

        .sidebar-storage-widget {
          padding: 12px 14px !important;
          border-radius: 10px !important;
          background: rgba(255, 255, 255, 0.04) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 6px !important;
        }

        .widget-header-row {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          font-size: 11.5px !important;
          font-weight: 850 !important;
          color: #E2E8F0 !important;
        }
        .widget-status-online {
          color: #34D399 !important;
          font-size: 10.5px !important;
          font-weight: 800 !important;
        }

        .widget-stat-row {
          display: flex !important;
          justify-content: space-between !important;
          font-size: 11.5px !important;
          color: #CBD5E1 !important;
          font-weight: 600 !important;
        }
        .widget-stat-val {
          font-weight: 850 !important;
          color: #FFFFFF !important;
        }

        .widget-bar-track {
          width: 100% !important;
          height: 5px !important;
          background: rgba(255, 255, 255, 0.12) !important;
          border-radius: 3px !important;
          overflow: hidden !important;
          margin-top: 4px !important;
        }
        .widget-bar-fill {
          height: 100% !important;
          background: linear-gradient(90deg, #3B82F6 0%, #10B981 100%) !important;
          border-radius: 3px !important;
        }

        .sidebar-user-strip {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 8px 10px !important;
          border-radius: 10px !important;
          background: rgba(255, 255, 255, 0.04) !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
        }

        .user-avatar-circle {
          width: 34px !important;
          height: 34px !important;
          border-radius: 10px !important;
          background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%) !important;
          color: #FFFFFF !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          border: 1px solid rgba(147, 197, 253, 0.4) !important;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3) !important;
        }

        .user-info-text {
          flex: 1 !important;
          overflow: hidden !important;
        }
        .user-name-title {
          font-size: 12.5px !important;
          font-weight: 850 !important;
          color: #FFFFFF !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .user-role-sub {
          font-size: 10.5px !important;
          color: #94A3B8 !important;
          font-weight: 700 !important;
        }

        .sidebar-logout-btn {
          background: rgba(239, 68, 68, 0.1) !important;
          border: 1px solid rgba(239, 68, 68, 0.2) !important;
          color: #F87171 !important;
          padding: 7px !important;
          border-radius: 8px !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .sidebar-logout-btn:hover {
          background: #DC2626 !important;
          color: #FFFFFF !important;
          border-color: #DC2626 !important;
          transform: scale(1.08) !important;
        }

        /* Topbar Software Guide Button */
        .topbar-guide-btn {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          padding: 5px 12px !important;
          background: linear-gradient(135deg, #1E40AF 0%, #2563EB 100%) !important;
          border: 1px solid #3B82F6 !important;
          color: #FFFFFF !important;
          border-radius: 20px !important;
          font-size: 11.5px !important;
          font-weight: 750 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25) !important;
        }
        .topbar-guide-btn:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4) !important;
          background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%) !important;
        }
        .guide-btn-icon {
          color: #FDE68A !important;
        }
        .guide-btn-tag {
          font-size: 9px !important;
          background: rgba(255, 255, 255, 0.2) !important;
          padding: 1px 5px !important;
          border-radius: 4px !important;
          letter-spacing: 0.5px !important;
        }

        @keyframes pulseRedBadge {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
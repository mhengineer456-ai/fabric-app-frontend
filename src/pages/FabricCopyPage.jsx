import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Scissors, Cpu, UploadCloud, Plus, Search, Filter,
  Printer, Download, Eye, Trash2, CheckCircle2, Clock,
  AlertCircle, Tag, Layers, RefreshCw, FileText, ArrowRight,
  Sparkles, X, Check, Copy, ExternalLink, ShieldCheck, Database
} from 'lucide-react';
import '../Design/FabricCopy.css';

// Initial Mock Seed Data for Cutting Copies
const INITIAL_CUTTING_COPIES = [
  {
    id: 'CC-2026-101',
    date: '2026-10-10',
    jobOrder: 'JO-214',
    tableNo: 'Table 3',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'BLACK',
    cutterMaster: 'Master Rajesh Kumar',
    rolls: 6,
    weightKg: 132.5,
    plies: 120,
    sizes: { S: 240, M: 480, L: 480, XL: 240 },
    totalPcs: 1440,
    status: 'In Cutting',
    remarks: 'Lot MH-4542(R) issued for Winter Jacket bodies'
  },
  {
    id: 'CC-2026-102',
    date: '2026-10-09',
    jobOrder: 'JO-189',
    tableNo: 'Table 1',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'RED',
    cutterMaster: 'Master Aslam Khan',
    rolls: 4,
    weightKg: 88.0,
    plies: 95,
    sizes: { S: 190, M: 380, L: 380, XL: 190 },
    totalPcs: 1140,
    status: 'Completed',
    remarks: 'Lot MH-4607 completed without shortage'
  },
  {
    id: 'CC-2026-103',
    date: '2026-10-08',
    jobOrder: 'JO-177',
    tableNo: 'Table 5',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'CEMENT',
    cutterMaster: 'Master Suresh Sharma',
    rolls: 5,
    weightKg: 112.4,
    plies: 110,
    sizes: { M: 440, L: 440, XL: 220 },
    totalPcs: 1100,
    status: 'Verified',
    remarks: 'Lot MH-4596 audit verified by QA'
  },
  {
    id: 'CC-2026-104',
    date: '2026-10-07',
    jobOrder: 'JO-162',
    tableNo: 'Table 2',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'OLIVE',
    cutterMaster: 'Master Ramesh Verma',
    rolls: 8,
    weightKg: 176.2,
    plies: 140,
    sizes: { S: 280, M: 560, L: 560, XL: 280 },
    totalPcs: 1680,
    status: 'In Cutting',
    remarks: 'Lot MH-4608 ongoing cutting'
  }
];

// Initial Mock Seed Data for Digitalize Gatta Cards
const INITIAL_GATTA_CARDS = [
  {
    id: 'GAT-4542-01',
    lotNo: 'MH-4542(R)',
    jobOrder: 'JO-214',
    bundleNo: 'B-01',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'BLACK',
    rollSequence: 'Roll 1 of 6',
    markerLengthMtr: 4.85,
    weightKg: 22.4,
    plies: 120,
    sizesRatio: 'S:2 | M:4 | L:4 | XL:2',
    bundlePcs: 240,
    bundlerName: 'Sunil Bundler',
    date: '2026-10-10',
    status: 'Active'
  },
  {
    id: 'GAT-4542-02',
    lotNo: 'MH-4542(R)',
    jobOrder: 'JO-214',
    bundleNo: 'B-02',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'BLACK',
    rollSequence: 'Roll 2 of 6',
    markerLengthMtr: 4.85,
    weightKg: 21.8,
    plies: 120,
    sizesRatio: 'S:2 | M:4 | L:4 | XL:2',
    bundlePcs: 240,
    bundlerName: 'Sunil Bundler',
    date: '2026-10-10',
    status: 'Active'
  },
  {
    id: 'GAT-4607-01',
    lotNo: 'MH-4607',
    jobOrder: 'JO-189',
    bundleNo: 'B-01',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'RED',
    rollSequence: 'Roll 1 of 4',
    markerLengthMtr: 3.90,
    weightKg: 22.0,
    plies: 95,
    sizesRatio: 'S:1 | M:2 | L:2 | XL:1',
    bundlePcs: 190,
    bundlerName: 'Deepak Bundler',
    date: '2026-10-09',
    status: 'Consumed'
  },
  {
    id: 'GAT-4596-01',
    lotNo: 'MH-4596',
    jobOrder: 'JO-177',
    bundleNo: 'B-01',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'CEMENT',
    rollSequence: 'Roll 1 of 5',
    markerLengthMtr: 4.20,
    weightKg: 22.5,
    plies: 110,
    sizesRatio: 'M:2 | L:2 | XL:1',
    bundlePcs: 220,
    bundlerName: 'Manoj Bundler',
    date: '2026-10-08',
    status: 'Verified'
  }
];

// Initial Mock Seed Data for Uploaded Document Copies
const INITIAL_UPLOADED_COPIES = [
  {
    id: 'DOC-1001',
    title: 'Table 3 Physical Cutting Slip - Black Fleece',
    category: 'Cutting Copy',
    jobOrder: 'JO-214',
    lotNo: 'MH-4542(R)',
    tableNo: 'Table 3',
    uploadedBy: 'Supervisor Vinod',
    date: '2026-10-10',
    fileType: 'image',
    fileName: 'cutting_slip_jo214_table3.jpg',
    fileUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    notes: 'Physical signature of Master Rajesh on shift handover'
  },
  {
    id: 'DOC-1002',
    title: 'Gatta Board Card Scan - Lot MH-4607 Red',
    category: 'Digitalize Gatta',
    jobOrder: 'JO-189',
    lotNo: 'MH-4607',
    tableNo: 'Table 1',
    uploadedBy: 'QA Inspector Anil',
    date: '2026-10-09',
    fileType: 'image',
    fileName: 'gatta_card_lot4607.jpg',
    fileUrl: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&auto=format&fit=crop&q=80',
    notes: 'Cardboard gatta bundle markers with size breakdown stamps'
  },
  {
    id: 'DOC-1003',
    title: 'Mill Delivery & Dyeing Copy - Lot MH-4596 Cement',
    category: 'Upload Copy',
    jobOrder: 'JO-177',
    lotNo: 'MH-4596',
    tableNo: 'Table 5',
    uploadedBy: 'Store Incharge Paras',
    date: '2026-10-08',
    fileType: 'image',
    fileName: 'dyeing_challan_mh4596.jpg',
    fileUrl: 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=600&auto=format&fit=crop&q=80',
    notes: 'Dyeing house delivery challan verified with weight scales'
  }
];

export default function FabricCopyPage({ defaultTab }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL or props
  const currentTab = useMemo(() => {
    if (location.pathname.includes('/cutting-copy')) return 'cutting-copy';
    if (location.pathname.includes('/digitalize-gatta')) return 'digitalize-gatta';
    if (location.pathname.includes('/upload-copy')) return 'upload-copy';
    return defaultTab || 'cutting-copy';
  }, [location.pathname, defaultTab]);

  const [activeTab, setActiveTab] = useState(currentTab);

  useEffect(() => {
    setActiveTab(currentTab);
  }, [currentTab]);

  const handleTabSwitch = (tabKey) => {
    setActiveTab(tabKey);
    navigate(`/fabric-copy/${tabKey}`);
  };

  // State for Cutting Copies
  const [cuttingCopies, setCuttingCopies] = useState(() => {
    try {
      const saved = localStorage.getItem('twms_cutting_copies');
      return saved ? JSON.parse(saved) : INITIAL_CUTTING_COPIES;
    } catch {
      return INITIAL_CUTTING_COPIES;
    }
  });

  // State for Gatta Cards
  const [gattaCards, setGattaCards] = useState(() => {
    try {
      const saved = localStorage.getItem('twms_gatta_cards');
      return saved ? JSON.parse(saved) : INITIAL_GATTA_CARDS;
    } catch {
      return INITIAL_GATTA_CARDS;
    }
  });

  // State for Uploaded Copies
  const [uploadedCopies, setUploadedCopies] = useState(() => {
    try {
      const saved = localStorage.getItem('twms_uploaded_copies');
      return saved ? JSON.parse(saved) : INITIAL_UPLOADED_COPIES;
    } catch {
      return INITIAL_UPLOADED_COPIES;
    }
  });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('twms_cutting_copies', JSON.stringify(cuttingCopies));
  }, [cuttingCopies]);

  useEffect(() => {
    localStorage.setItem('twms_gatta_cards', JSON.stringify(gattaCards));
  }, [gattaCards]);

  useEffect(() => {
    localStorage.setItem('twms_uploaded_copies', JSON.stringify(uploadedCopies));
  }, [uploadedCopies]);

  // Search & Filter State
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals State
  const [showAddCopyModal, setShowAddCopyModal] = useState(false);
  const [showAddGattaModal, setShowAddGattaModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewDocModal, setViewDocModal] = useState(null);
  const [printChallanModal, setPrintChallanModal] = useState(null);

  // New Cutting Copy Form State
  const [newCopy, setNewCopy] = useState({
    jobOrder: 'JO-220',
    tableNo: 'Table 4',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'BLACK',
    cutterMaster: 'Master Rajesh Kumar',
    rolls: 5,
    weightKg: 110.0,
    plies: 100,
    sizeS: 200,
    sizeM: 400,
    sizeL: 400,
    sizeXL: 200,
    status: 'In Cutting',
    remarks: ''
  });

  // New Gatta Card Form State
  const [newGatta, setNewGatta] = useState({
    lotNo: 'MH-4542(R)',
    jobOrder: 'JO-214',
    bundleNo: 'B-03',
    fabricName: 'FABRIC MH GERMAN FLEECE',
    shade: 'BLACK',
    rollSequence: 'Roll 3 of 6',
    markerLengthMtr: 4.85,
    weightKg: 22.0,
    plies: 120,
    sizesRatio: 'S:2 | M:4 | L:4 | XL:2',
    bundlePcs: 240,
    bundlerName: 'Sunil Bundler',
    status: 'Active'
  });

  // New Upload Document State
  const [newUpload, setNewUpload] = useState({
    title: '',
    category: 'Cutting Copy',
    jobOrder: '',
    lotNo: '',
    tableNo: 'Table 1',
    uploadedBy: 'Store Operator',
    notes: '',
    fileUrl: '',
    fileName: ''
  });

  const fileInputRef = useRef(null);

  // Handle Create Cutting Copy
  const handleCreateCopy = (e) => {
    e.preventDefault();
    const totalPcs = Number(newCopy.sizeS || 0) + Number(newCopy.sizeM || 0) + Number(newCopy.sizeL || 0) + Number(newCopy.sizeXL || 0);
    const item = {
      id: `CC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toISOString().slice(0, 10),
      jobOrder: newCopy.jobOrder,
      tableNo: newCopy.tableNo,
      fabricName: newCopy.fabricName,
      shade: newCopy.shade,
      cutterMaster: newCopy.cutterMaster,
      rolls: Number(newCopy.rolls) || 1,
      weightKg: Number(newCopy.weightKg) || 0,
      plies: Number(newCopy.plies) || 0,
      sizes: {
        S: Number(newCopy.sizeS) || 0,
        M: Number(newCopy.sizeM) || 0,
        L: Number(newCopy.sizeL) || 0,
        XL: Number(newCopy.sizeXL) || 0
      },
      totalPcs: totalPcs || 0,
      status: newCopy.status,
      remarks: newCopy.remarks || 'Standard cutting lay'
    };

    setCuttingCopies([item, ...cuttingCopies]);
    setShowAddCopyModal(false);
  };

  // Handle Create Gatta Card
  const handleCreateGatta = (e) => {
    e.preventDefault();
    const item = {
      id: `GAT-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10 + Math.random() * 90)}`,
      lotNo: newGatta.lotNo,
      jobOrder: newGatta.jobOrder,
      bundleNo: newGatta.bundleNo,
      fabricName: newGatta.fabricName,
      shade: newGatta.shade,
      rollSequence: newGatta.rollSequence,
      markerLengthMtr: Number(newGatta.markerLengthMtr) || 0,
      weightKg: Number(newGatta.weightKg) || 0,
      plies: Number(newGatta.plies) || 0,
      sizesRatio: newGatta.sizesRatio,
      bundlePcs: Number(newGatta.bundlePcs) || 0,
      bundlerName: newGatta.bundlerName,
      date: new Date().toISOString().slice(0, 10),
      status: newGatta.status
    };

    setGattaCards([item, ...gattaCards]);
    setShowAddGattaModal(false);
  };

  // Handle File Upload Change
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setNewUpload(prev => ({
        ...prev,
        fileName: file.name,
        fileUrl: event.target?.result,
        title: prev.title || file.name.replace(/\.[^/.]+$/, '')
      }));
    };
    reader.readAsDataURL(file);
  };

  // Handle Save Uploaded Copy
  const handleSaveUpload = (e) => {
    e.preventDefault();
    if (!newUpload.fileUrl) {
      alert('Please select a file or image to upload');
      return;
    }

    const item = {
      id: `DOC-${Math.floor(1000 + Math.random() * 9000)}`,
      title: newUpload.title || 'Cutting Attachment Copy',
      category: newUpload.category,
      jobOrder: newUpload.jobOrder || '—',
      lotNo: newUpload.lotNo || '—',
      tableNo: newUpload.tableNo || 'Table 1',
      uploadedBy: newUpload.uploadedBy || 'Store Operator',
      date: new Date().toISOString().slice(0, 10),
      fileType: newUpload.fileName?.endsWith('.pdf') ? 'pdf' : 'image',
      fileName: newUpload.fileName,
      fileUrl: newUpload.fileUrl,
      notes: newUpload.notes || ''
    };

    setUploadedCopies([item, ...uploadedCopies]);
    setShowUploadModal(false);
    setNewUpload({
      title: '',
      category: 'Cutting Copy',
      jobOrder: '',
      lotNo: '',
      tableNo: 'Table 1',
      uploadedBy: 'Store Operator',
      notes: '',
      fileUrl: '',
      fileName: ''
    });
  };

  // Filtered lists
  const filteredCuttingCopies = useMemo(() => {
    return cuttingCopies.filter(c => {
      if (statusFilter !== 'ALL' && c.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (!searchKeyword) return true;
      const k = searchKeyword.toLowerCase();
      return (
        c.id.toLowerCase().includes(k) ||
        c.jobOrder.toLowerCase().includes(k) ||
        c.tableNo.toLowerCase().includes(k) ||
        c.fabricName.toLowerCase().includes(k) ||
        c.shade.toLowerCase().includes(k) ||
        c.cutterMaster.toLowerCase().includes(k)
      );
    });
  }, [cuttingCopies, searchKeyword, statusFilter]);

  const filteredGattaCards = useMemo(() => {
    return gattaCards.filter(g => {
      if (statusFilter !== 'ALL' && g.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (!searchKeyword) return true;
      const k = searchKeyword.toLowerCase();
      return (
        g.id.toLowerCase().includes(k) ||
        g.lotNo.toLowerCase().includes(k) ||
        g.jobOrder.toLowerCase().includes(k) ||
        g.fabricName.toLowerCase().includes(k) ||
        g.shade.toLowerCase().includes(k) ||
        g.bundlerName.toLowerCase().includes(k)
      );
    });
  }, [gattaCards, searchKeyword, statusFilter]);

  const filteredUploadedCopies = useMemo(() => {
    return uploadedCopies.filter(d => {
      if (!searchKeyword) return true;
      const k = searchKeyword.toLowerCase();
      return (
        d.title.toLowerCase().includes(k) ||
        d.category.toLowerCase().includes(k) ||
        d.jobOrder.toLowerCase().includes(k) ||
        d.lotNo.toLowerCase().includes(k) ||
        d.tableNo.toLowerCase().includes(k) ||
        d.uploadedBy.toLowerCase().includes(k)
      );
    });
  }, [uploadedCopies, searchKeyword]);

  return (
    <div className="fabric-copy-container">
      {/* Top Header */}
      <div className="fabric-copy-header">
        <div className="fabric-copy-title-group">
          <h1>
            <Copy size={26} style={{ color: '#2563EB' }} />
            Fabric Copy Management Suite
          </h1>
          <p>Cutting Challan copies, Digitalized Gatta cards, and Scanned physical document archive</p>
        </div>

        <div className="fc-header-actions">
          {activeTab === 'cutting-copy' && (
            <button className="fc-btn fc-btn-primary" onClick={() => setShowAddCopyModal(true)}>
              <Plus size={16} /> Create Cutting Copy
            </button>
          )}

          {activeTab === 'digitalize-gatta' && (
            <button className="fc-btn fc-btn-primary" onClick={() => setShowAddGattaModal(true)}>
              <Cpu size={16} /> Digitize Gatta Card
            </button>
          )}

          {activeTab === 'upload-copy' && (
            <button className="fc-btn fc-btn-primary" onClick={() => setShowUploadModal(true)}>
              <UploadCloud size={16} /> Upload New Copy
            </button>
          )}
        </div>
      </div>

      {/* Nav Sub-Tabs Bar */}
      <div className="fc-tabs-bar">
        <button
          className={`fc-tab-btn ${activeTab === 'cutting-copy' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('cutting-copy')}
        >
          <Scissors size={17} />
          <span>Cutting Copy</span>
          <span className="fc-tab-count-badge">{cuttingCopies.length}</span>
        </button>

        <button
          className={`fc-tab-btn ${activeTab === 'digitalize-gatta' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('digitalize-gatta')}
        >
          <Cpu size={17} />
          <span>Digitalize Gatta</span>
          <span className="fc-tab-count-badge">{gattaCards.length}</span>
        </button>

        <button
          className={`fc-tab-btn ${activeTab === 'upload-copy' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('upload-copy')}
        >
          <UploadCloud size={17} />
          <span>Upload Copy</span>
          <span className="fc-tab-count-badge">{uploadedCopies.length}</span>
        </button>
      </div>

      {/* SUB-TAB 1: CUTTING COPY */}
      {activeTab === 'cutting-copy' && (
        <>
          {/* Stats Bar */}
          <div className="fc-stats-grid">
            <div className="fc-stat-card">
              <div className="fc-stat-icon-wrapper" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                <Scissors size={22} />
              </div>
              <div className="fc-stat-content">
                <div className="fc-stat-label">Total Cutting Copies</div>
                <div className="fc-stat-value">{cuttingCopies.length}</div>
                <div className="fc-stat-sub">Active cutting challans</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon-wrapper" style={{ background: '#fef3c7', color: '#b45309' }}>
                <Clock size={22} />
              </div>
              <div className="fc-stat-content">
                <div className="fc-stat-label">In Cutting (Live)</div>
                <div className="fc-stat-value">{cuttingCopies.filter(c => c.status === 'In Cutting').length}</div>
                <div className="fc-stat-sub">Tables currently active</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon-wrapper" style={{ background: '#dcfce7', color: '#15803d' }}>
                <Layers size={22} />
              </div>
              <div className="fc-stat-content">
                <div className="fc-stat-label">Total Rolls Allocated</div>
                <div className="fc-stat-value">{cuttingCopies.reduce((s, c) => s + (c.rolls || 0), 0)} Rolls</div>
                <div className="fc-stat-sub">{cuttingCopies.reduce((s, c) => s + (c.weightKg || 0), 0).toFixed(1)} Kg issued</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon-wrapper" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
                <CheckCircle2 size={22} />
              </div>
              <div className="fc-stat-content">
                <div className="fc-stat-label">Total Pieces Output</div>
                <div className="fc-stat-value">{cuttingCopies.reduce((s, c) => s + (c.totalPcs || 0), 0).toLocaleString()} Pcs</div>
                <div className="fc-stat-sub">Garments cut across tables</div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="fc-filter-strip">
            <div className="fc-search-box">
              <Search size={16} style={{ color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search by Slip No, Job Order, Table, Fabric, Shade..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>

            <div className="fc-filter-group">
              <select className="fc-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value="IN CUTTING">In Cutting</option>
                <option value="COMPLETED">Completed</option>
                <option value="VERIFIED">Verified</option>
              </select>
            </div>
          </div>

          {/* Table Box */}
          <div className="fc-card-box">
            <div className="fc-card-box-header">
              <div className="fc-card-box-title">
                <Scissors size={18} style={{ color: '#2563EB' }} />
                Cutting Copies Register
              </div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Showing {filteredCuttingCopies.length} of {cuttingCopies.length} slips
              </span>
            </div>

            <div className="fc-table-responsive">
              <table className="fc-table">
                <thead>
                  <tr>
                    <th>Copy / Slip No</th>
                    <th>Date</th>
                    <th>Job Order</th>
                    <th>Table No</th>
                    <th>Fabric Description</th>
                    <th>Shade</th>
                    <th>Cutter Master</th>
                    <th style={{ textAlign: 'right' }}>Rolls</th>
                    <th style={{ textAlign: 'right' }}>Weight (Kg)</th>
                    <th style={{ textAlign: 'right' }}>Plies</th>
                    <th style={{ textAlign: 'right' }}>Total Pcs</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCuttingCopies.length === 0 ? (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        No cutting copies found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCuttingCopies.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 800, color: '#1e3a8a' }}>{item.id}</td>
                        <td>{item.date}</td>
                        <td><span style={{ fontWeight: 700, color: '#0f172a' }}>{item.jobOrder}</span></td>
                        <td><span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>{item.tableNo}</span></td>
                        <td style={{ fontWeight: 600 }}>{item.fabricName}</td>
                        <td><span style={{ fontWeight: 700 }}>{item.shade}</span></td>
                        <td>{item.cutterMaster}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.rolls}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.weightKg}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.plies}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{Number(item.totalPcs).toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`fc-badge ${item.status === 'In Cutting' ? 'fc-badge-in-cutting' : item.status === 'Completed' ? 'fc-badge-completed' : 'fc-badge-verified'}`}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            title="Print Cutting Slip"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '4px' }}
                            onClick={() => setPrintChallanModal(item)}
                          >
                            <Printer size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* SUB-TAB 2: DIGITALIZE GATTA */}
      {activeTab === 'digitalize-gatta' && (
        <>
          {/* Stats Bar */}
          <div className="fc-stats-grid">
            <div className="fc-stat-card">
              <div className="fc-stat-icon-wrapper" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                <Cpu size={22} />
              </div>
              <div className="fc-stat-content">
                <div className="fc-stat-label">Digitized Gatta Cards</div>
                <div className="fc-stat-value">{gattaCards.length}</div>
                <div className="fc-stat-sub">Bundle cards recorded</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon-wrapper" style={{ background: '#dcfce7', color: '#15803d' }}>
                <Tag size={22} />
              </div>
              <div className="fc-stat-content">
                <div className="fc-stat-label">Active Bundles</div>
                <div className="fc-stat-value">{gattaCards.filter(g => g.status === 'Active').length}</div>
                <div className="fc-stat-sub">Tagged & in production</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon-wrapper" style={{ background: '#fef3c7', color: '#b45309' }}>
                <Layers size={22} />
              </div>
              <div className="fc-stat-content">
                <div className="fc-stat-label">Digitized Roll Weight</div>
                <div className="fc-stat-value">{gattaCards.reduce((s, g) => s + (g.weightKg || 0), 0).toFixed(1)} Kg</div>
                <div className="fc-stat-sub">Fabric rolls tagged</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon-wrapper" style={{ background: '#e0e7ff', color: '#4338ca' }}>
                <CheckCircle2 size={22} />
              </div>
              <div className="fc-stat-content">
                <div className="fc-stat-label">Verified Gatta Bundles</div>
                <div className="fc-stat-value">{gattaCards.reduce((s, g) => s + (g.bundlePcs || 0), 0).toLocaleString()} Pcs</div>
                <div className="fc-stat-sub">Bundled piece integrity</div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="fc-filter-strip">
            <div className="fc-search-box">
              <Search size={16} style={{ color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search Gatta No, Lot No, Job Order, Shade, Bundler..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>

            <div className="fc-filter-group">
              <select className="fc-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All Gatta Status</option>
                <option value="ACTIVE">Active</option>
                <option value="CONSUMED">Consumed</option>
                <option value="VERIFIED">Verified</option>
              </select>
            </div>
          </div>

          {/* Gatta Cards Gallery */}
          <div className="fc-card-box">
            <div className="fc-card-box-header">
              <div className="fc-card-box-title">
                <Cpu size={18} style={{ color: '#2563EB' }} />
                Digitized Gatta & Bundle Cards Gallery
              </div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {filteredGattaCards.length} Gatta Cards
              </span>
            </div>

            <div className="fc-gatta-grid">
              {filteredGattaCards.map(gatta => (
                <div key={gatta.id} className="fc-gatta-card">
                  <div>
                    <div className="fc-gatta-header">
                      <span className="fc-gatta-tag">{gatta.id}</span>
                      <span className={`fc-badge ${gatta.status === 'Active' ? 'fc-badge-in-cutting' : 'fc-badge-completed'}`}>
                        {gatta.status}
                      </span>
                    </div>

                    <div className="fc-gatta-details-row">
                      <span className="fc-gatta-label">Dyeing Lot No:</span>
                      <span className="fc-gatta-val" style={{ color: '#2563eb' }}>{gatta.lotNo}</span>
                    </div>

                    <div className="fc-gatta-details-row">
                      <span className="fc-gatta-label">Job Order:</span>
                      <span className="fc-gatta-val">{gatta.jobOrder} ({gatta.bundleNo})</span>
                    </div>

                    <div className="fc-gatta-details-row">
                      <span className="fc-gatta-label">Fabric / Shade:</span>
                      <span className="fc-gatta-val">{gatta.shade}</span>
                    </div>

                    <div className="fc-gatta-details-row">
                      <span className="fc-gatta-label">Roll Sequence:</span>
                      <span className="fc-gatta-val">{gatta.rollSequence} ({gatta.weightKg} Kg)</span>
                    </div>

                    <div className="fc-gatta-details-row">
                      <span className="fc-gatta-label">Lay & Plies:</span>
                      <span className="fc-gatta-val">{gatta.plies} Plies ({gatta.markerLengthMtr} Mtr)</span>
                    </div>

                    <div className="fc-gatta-details-row">
                      <span className="fc-gatta-label">Bundle Pcs:</span>
                      <span className="fc-gatta-val" style={{ fontSize: '15px', color: '#15803d' }}>{gatta.bundlePcs} Pcs</span>
                    </div>

                    <div className="fc-gatta-sizes-chip">
                      <span style={{ fontSize: '11px', color: '#64748b', alignSelf: 'center' }}>Ratio:</span>
                      <span className="fc-size-pill">{gatta.sizesRatio}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Bundler: {gatta.bundlerName}</span>
                    <button
                      className="fc-btn fc-btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '11.5px' }}
                      onClick={() => alert(`Print barcode label for Gatta Card: ${gatta.id}`)}
                    >
                      <Printer size={13} /> Print Tag
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* SUB-TAB 3: UPLOAD COPY */}
      {activeTab === 'upload-copy' && (
        <>
          {/* Upload Dropzone */}
          <div className="fc-upload-dropzone" onClick={() => fileInputRef.current?.click()}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*,application/pdf"
              onChange={(e) => {
                handleFileUpload(e);
                setShowUploadModal(true);
              }}
            />
            <div className="fc-upload-icon-circle">
              <UploadCloud size={28} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0' }}>
              Upload Scanned Physical Cutting Copy or Gatta Photo
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Click to browse or drag & drop handwritten cutting challans, gatta cards, or mill delivery receipts (JPG, PNG, PDF)
            </p>
          </div>

          {/* Gallery Box */}
          <div className="fc-card-box">
            <div className="fc-card-box-header">
              <div className="fc-card-box-title">
                <FileText size={18} style={{ color: '#2563EB' }} />
                Scanned Physical Documents Archive
              </div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {filteredUploadedCopies.length} Document Copies
              </span>
            </div>

            <div className="fc-gallery-grid">
              {filteredUploadedCopies.map(doc => (
                <div key={doc.id} className="fc-doc-card">
                  <div className="fc-doc-preview" onClick={() => setViewDocModal(doc)} style={{ cursor: 'pointer' }}>
                    {doc.fileType === 'pdf' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#dc2626' }}>
                        <FileText size={36} />
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>PDF Document</span>
                      </div>
                    ) : (
                      <img src={doc.fileUrl} alt={doc.title} />
                    )}
                  </div>

                  <div className="fc-doc-body">
                    <h4 className="fc-doc-title" title={doc.title}>{doc.title}</h4>
                    <div className="fc-doc-meta">
                      <span>{doc.category}</span>
                      <span>{doc.date}</span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#475569', marginBottom: 12 }}>
                      <div><strong>Job Order:</strong> {doc.jobOrder}</div>
                      <div><strong>Lot No:</strong> {doc.lotNo}</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>By: {doc.uploadedBy}</span>
                      <button
                        className="fc-btn fc-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11.5px' }}
                        onClick={() => setViewDocModal(doc)}
                      >
                        <Eye size={13} /> View Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* MODAL: CREATE CUTTING COPY */}
      {showAddCopyModal && (
        <div className="fc-modal-overlay" onClick={() => setShowAddCopyModal(false)}>
          <div className="fc-modal-card" onClick={e => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div className="fc-modal-title">
                <Scissors size={20} style={{ color: '#2563EB' }} />
                Create New Cutting Copy
              </div>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setShowAddCopyModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCopy}>
              <div className="fc-modal-body">
                <div className="fc-form-grid">
                  <div className="fc-form-group">
                    <label className="fc-form-label">Job Order No</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newCopy.jobOrder}
                      onChange={e => setNewCopy({ ...newCopy, jobOrder: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Cutting Table</label>
                    <select
                      className="fc-input"
                      value={newCopy.tableNo}
                      onChange={e => setNewCopy({ ...newCopy, tableNo: e.target.value })}
                    >
                      {Array.from({ length: 20 }, (_, i) => `Table ${i + 1}`).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Fabric Name</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newCopy.fabricName}
                      onChange={e => setNewCopy({ ...newCopy, fabricName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Shade / Color</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newCopy.shade}
                      onChange={e => setNewCopy({ ...newCopy, shade: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Cutter Master</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newCopy.cutterMaster}
                      onChange={e => setNewCopy({ ...newCopy, cutterMaster: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Status</label>
                    <select
                      className="fc-input"
                      value={newCopy.status}
                      onChange={e => setNewCopy({ ...newCopy, status: e.target.value })}
                    >
                      <option value="In Cutting">In Cutting</option>
                      <option value="Completed">Completed</option>
                      <option value="Verified">Verified</option>
                    </select>
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Rolls Allocated</label>
                    <input
                      className="fc-input"
                      type="number"
                      value={newCopy.rolls}
                      onChange={e => setNewCopy({ ...newCopy, rolls: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Total Weight (Kg)</label>
                    <input
                      className="fc-input"
                      type="number"
                      step="0.1"
                      value={newCopy.weightKg}
                      onChange={e => setNewCopy({ ...newCopy, weightKg: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Lay Plies Count</label>
                    <input
                      className="fc-input"
                      type="number"
                      value={newCopy.plies}
                      onChange={e => setNewCopy({ ...newCopy, plies: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group col-span-2">
                    <label className="fc-form-label">Size Ratio Breakdown (Estimated Pieces)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>Size S:</span>
                        <input
                          className="fc-input"
                          type="number"
                          value={newCopy.sizeS}
                          onChange={e => setNewCopy({ ...newCopy, sizeS: e.target.value })}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>Size M:</span>
                        <input
                          className="fc-input"
                          type="number"
                          value={newCopy.sizeM}
                          onChange={e => setNewCopy({ ...newCopy, sizeM: e.target.value })}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>Size L:</span>
                        <input
                          className="fc-input"
                          type="number"
                          value={newCopy.sizeL}
                          onChange={e => setNewCopy({ ...newCopy, sizeL: e.target.value })}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>Size XL:</span>
                        <input
                          className="fc-input"
                          type="number"
                          value={newCopy.sizeXL}
                          onChange={e => setNewCopy({ ...newCopy, sizeXL: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="fc-form-group col-span-2">
                    <label className="fc-form-label">Remarks / Special Instructions</label>
                    <input
                      className="fc-input"
                      type="text"
                      placeholder="e.g. Check shade banding on roll 3"
                      value={newCopy.remarks}
                      onChange={e => setNewCopy({ ...newCopy, remarks: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="fc-modal-footer">
                <button type="button" className="fc-btn fc-btn-secondary" onClick={() => setShowAddCopyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="fc-btn fc-btn-primary">
                  Save & Generate Copy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DIGITIZE GATTA CARD */}
      {showAddGattaModal && (
        <div className="fc-modal-overlay" onClick={() => setShowAddGattaModal(false)}>
          <div className="fc-modal-card" onClick={e => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div className="fc-modal-title">
                <Cpu size={20} style={{ color: '#2563EB' }} />
                Digitize Physical Gatta Card
              </div>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setShowAddGattaModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGatta}>
              <div className="fc-modal-body">
                <div className="fc-form-grid">
                  <div className="fc-form-group">
                    <label className="fc-form-label">Dyeing Lot Number</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newGatta.lotNo}
                      onChange={e => setNewGatta({ ...newGatta, lotNo: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Job Order No</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newGatta.jobOrder}
                      onChange={e => setNewGatta({ ...newGatta, jobOrder: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Bundle No / Marker</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newGatta.bundleNo}
                      onChange={e => setNewGatta({ ...newGatta, bundleNo: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Roll Sequence</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newGatta.rollSequence}
                      onChange={e => setNewGatta({ ...newGatta, rollSequence: e.target.value })}
                      placeholder="e.g. Roll 1 of 4"
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Fabric Description</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newGatta.fabricName}
                      onChange={e => setNewGatta({ ...newGatta, fabricName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Shade</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newGatta.shade}
                      onChange={e => setNewGatta({ ...newGatta, shade: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Roll Weight (Kg)</label>
                    <input
                      className="fc-input"
                      type="number"
                      step="0.1"
                      value={newGatta.weightKg}
                      onChange={e => setNewGatta({ ...newGatta, weightKg: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Marker Length (Mtr)</label>
                    <input
                      className="fc-input"
                      type="number"
                      step="0.01"
                      value={newGatta.markerLengthMtr}
                      onChange={e => setNewGatta({ ...newGatta, markerLengthMtr: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Size Ratio Pattern</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newGatta.sizesRatio}
                      onChange={e => setNewGatta({ ...newGatta, sizesRatio: e.target.value })}
                      placeholder="e.g. S:2 | M:4 | L:4 | XL:2"
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Bundle Total Pieces</label>
                    <input
                      className="fc-input"
                      type="number"
                      value={newGatta.bundlePcs}
                      onChange={e => setNewGatta({ ...newGatta, bundlePcs: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group col-span-2">
                    <label className="fc-form-label">Bundler / Operator Name</label>
                    <input
                      className="fc-input"
                      type="text"
                      value={newGatta.bundlerName}
                      onChange={e => setNewGatta({ ...newGatta, bundlerName: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="fc-modal-footer">
                <button type="button" className="fc-btn fc-btn-secondary" onClick={() => setShowAddGattaModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="fc-btn fc-btn-primary">
                  Save Gatta Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD COPY ATTACHMENT */}
      {showUploadModal && (
        <div className="fc-modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="fc-modal-card" onClick={e => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div className="fc-modal-title">
                <UploadCloud size={20} style={{ color: '#2563EB' }} />
                Upload Document Copy Details
              </div>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setShowUploadModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUpload}>
              <div className="fc-modal-body">
                <div className="fc-form-grid">
                  <div className="fc-form-group col-span-2">
                    <label className="fc-form-label">Document Title / Description</label>
                    <input
                      className="fc-input"
                      type="text"
                      placeholder="e.g. Table 3 Supervisor Cutting Slip"
                      value={newUpload.title}
                      onChange={e => setNewUpload({ ...newUpload, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Category</label>
                    <select
                      className="fc-input"
                      value={newUpload.category}
                      onChange={e => setNewUpload({ ...newUpload, category: e.target.value })}
                    >
                      <option value="Cutting Copy">Cutting Copy</option>
                      <option value="Digitalize Gatta">Digitalize Gatta</option>
                      <option value="Upload Copy">Upload Copy (Challan / Bill)</option>
                    </select>
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Table Number</label>
                    <select
                      className="fc-input"
                      value={newUpload.tableNo}
                      onChange={e => setNewUpload({ ...newUpload, tableNo: e.target.value })}
                    >
                      {Array.from({ length: 20 }, (_, i) => `Table ${i + 1}`).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Linked Job Order</label>
                    <input
                      className="fc-input"
                      type="text"
                      placeholder="e.g. JO-214"
                      value={newUpload.jobOrder}
                      onChange={e => setNewUpload({ ...newUpload, jobOrder: e.target.value })}
                    />
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-form-label">Linked Lot No</label>
                    <input
                      className="fc-input"
                      type="text"
                      placeholder="e.g. MH-4542(R)"
                      value={newUpload.lotNo}
                      onChange={e => setNewUpload({ ...newUpload, lotNo: e.target.value })}
                    />
                  </div>

                  {newUpload.fileUrl && (
                    <div className="fc-form-group col-span-2">
                      <label className="fc-form-label">Attached Preview</label>
                      <div style={{ maxHeight: 180, overflow: 'hidden', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                        <img src={newUpload.fileUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="fc-modal-footer">
                <button type="button" className="fc-btn fc-btn-secondary" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="fc-btn fc-btn-primary">
                  Save to Archive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VIEW DOCUMENT PREVIEW */}
      {viewDocModal && (
        <div className="fc-modal-overlay" onClick={() => setViewDocModal(null)}>
          <div className="fc-modal-card" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div className="fc-modal-title">
                <FileText size={20} style={{ color: '#2563EB' }} />
                {viewDocModal.title}
              </div>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setViewDocModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="fc-modal-body" style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: '13px', background: '#f8fafc', padding: '10px 14px', borderRadius: 8 }}>
                <span><strong>Job Order:</strong> {viewDocModal.jobOrder}</span>
                <span><strong>Lot:</strong> {viewDocModal.lotNo}</span>
                <span><strong>Table:</strong> {viewDocModal.tableNo}</span>
                <span><strong>Date:</strong> {viewDocModal.date}</span>
              </div>

              <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}>
                <img src={viewDocModal.fileUrl} alt={viewDocModal.title} style={{ maxWidth: '100%', borderRadius: 8 }} />
              </div>
            </div>

            <div className="fc-modal-footer">
              <button className="fc-btn fc-btn-secondary" onClick={() => setViewDocModal(null)}>
                Close
              </button>
              <a href={viewDocModal.fileUrl} download={viewDocModal.fileName || 'document_copy.jpg'} className="fc-btn fc-btn-primary" style={{ textDecoration: 'none' }}>
                <Download size={15} /> Download Copy
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRINT CUTTING SLIP / CHALLAN */}
      {printChallanModal && (
        <div className="fc-modal-overlay" onClick={() => setPrintChallanModal(null)}>
          <div className="fc-modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="fc-modal-header">
              <div className="fc-modal-title">
                <Printer size={20} style={{ color: '#2563EB' }} />
                Print Cutting Challan Copy: {printChallanModal.id}
              </div>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setPrintChallanModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="fc-modal-body">
              {/* Slip Printable Frame */}
              <div style={{ border: '2px solid #0f172a', padding: 20, borderRadius: 8, background: '#fff', color: '#000', fontFamily: 'monospace' }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 10, marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>MOHIT HOSIERY — FABRIC CUTTING COPY</h3>
                  <div style={{ fontSize: '11px', marginTop: 4 }}>Slip No: {printChallanModal.id} | Date: {printChallanModal.date}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '12px', marginBottom: 14 }}>
                  <div><strong>Job Order:</strong> {printChallanModal.jobOrder}</div>
                  <div><strong>Table:</strong> {printChallanModal.tableNo}</div>
                  <div><strong>Fabric:</strong> {printChallanModal.fabricName}</div>
                  <div><strong>Shade:</strong> {printChallanModal.shade}</div>
                  <div><strong>Cutter Master:</strong> {printChallanModal.cutterMaster}</div>
                  <div><strong>Status:</strong> {printChallanModal.status}</div>
                </div>

                <div style={{ borderTop: '1px dashed #0f172a', borderBottom: '1px dashed #0f172a', padding: '8px 0', margin: '10px 0', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Rolls: {printChallanModal.rolls}</span>
                    <span>Weight: {printChallanModal.weightKg} Kg</span>
                    <span>Plies: {printChallanModal.plies}</span>
                    <span><strong>Total Pcs: {printChallanModal.totalPcs}</strong></span>
                  </div>
                </div>

                <div style={{ fontSize: '11px', marginTop: 10 }}>
                  <strong>Ratio Breakdown:</strong> S: {printChallanModal.sizes?.S || 0} | M: {printChallanModal.sizes?.M || 0} | L: {printChallanModal.sizes?.L || 0} | XL: {printChallanModal.sizes?.XL || 0}
                </div>

                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', fontSize: '11px', paddingTop: 20, borderTop: '1px solid #cbd5e1' }}>
                  <div>Cutter Sign: _______________</div>
                  <div>Supervisor Sign: _______________</div>
                </div>
              </div>
            </div>

            <div className="fc-modal-footer">
              <button className="fc-btn fc-btn-secondary" onClick={() => setPrintChallanModal(null)}>
                Cancel
              </button>
              <button className="fc-btn fc-btn-primary" onClick={() => window.print()}>
                <Printer size={15} /> Print Copy Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

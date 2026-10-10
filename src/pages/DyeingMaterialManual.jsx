import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../store.js';
import LocationPicker from '../components/LocationPicker.jsx';
import MasterDropdown from '../components/MasterDropdown.jsx';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import {
  Scale, Droplets, Printer, Plus, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, Search, ArrowRight, Save, Eye,
  Layers, Package, Calendar, User, FileText, ArrowLeft,
  Check, X, Sparkles, Clipboard, Hash, HardDriveDownload
} from 'lucide-react';

export default function DyeingMaterialManual() {
  const navigate = useNavigate();

  // Logged in user
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const u = localStorage.getItem('twms_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });

  // Main Form Metadata
  const [formData, setFormData] = useState({
    lotNumber: '',
    cmfName: '',
    fabricName: '',
    group: '',
    shade: '',
    billNumber: '',
    date: new Date().toISOString().split('T')[0],
    location: '',
    receivedPerson: currentUser?.name || 'Dyeing Operator',
    authorizedPerson: 'Store Manager',
  });

  // Rolls List for Manual Weight Entry
  const [rolls, setRolls] = useState([
    { id: 1, rollNumber: 1, weight: '', barcodeId: '' }
  ]);

  // Loading & Action States
  const [fetchingLot, setFetchingLot] = useState(false);
  const [lotFoundSource, setLotFoundSource] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [nextSeqBarcode, setNextSeqBarcode] = useState('');
  const [toast, setToast] = useState(null);

  // Quick Paste Weights Modal
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteInputText, setPasteInputText] = useState('');

  // Sticker Print Modal
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [stickerDataList, setStickerDataList] = useState([]);
  const [selectedStickerIdx, setSelectedStickerIdx] = useState(0);

  // Recent History
  const [recentDyeingRolls, setRecentDyeingRolls] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // Input refs for keyboard navigation (Enter key jumps to next weight)
  const weightInputRefs = useRef({});

  const showToast = (text, type = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Initial load: Fetch next barcode & load recent rolls
  useEffect(() => {
    loadNextBarcode();
    loadRecentRolls();
  }, []);

  const loadNextBarcode = async () => {
    try {
      const res = await store.getNextBarcodeId();
      if (res && res.data && res.data.barcodeId) {
        setNextSeqBarcode(res.data.barcodeId);
      }
    } catch (e) {
      console.warn('Could not fetch next barcode:', e.message);
    }
  };

  const loadRecentRolls = async (lot = '') => {
    setLoadingHistory(true);
    try {
      const res = await store.getRecentDyeingMaterials(lot, 40);
      if (res && res.success && Array.isArray(res.data)) {
        setRecentDyeingRolls(res.data);
      }
    } catch (e) {
      console.warn('Could not load recent dyeing rolls:', e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle Form Change
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Auto-lookup Lot Details from Sheets / DB
  const handleFetchLotDetails = async (targetLot = formData.lotNumber) => {
    const cleanLot = String(targetLot || '').trim();
    if (!cleanLot) {
      showToast('Please enter a Lot Number to search', 'error');
      return;
    }

    setFetchingLot(true);
    setLotFoundSource(null);

    try {
      // 1. Try Direct Google Sheets
      const sheetRes = await store.fetchFabricStockDirect(cleanLot);
      if (sheetRes && sheetRes.success && Array.isArray(sheetRes.data) && sheetRes.data.length > 0) {
        const match = sheetRes.data[0];
        setFormData(prev => ({
          ...prev,
          cmfName: match.party || match.cmfParty || prev.cmfName,
          fabricName: match.fabricName || prev.fabricName,
          shade: match.shade || prev.shade,
          group: prev.group || 'Dyeing Lot',
          billNumber: match.billNumber || match.issueNo || prev.billNumber,
          date: match.issueDate || prev.date
        }));
        setLotFoundSource('Google Sheets (FabricStock)');
        showToast(`✓ Found Lot ${cleanLot} details in Google Sheets!`, 'success');
        loadRecentRolls(cleanLot);
        return;
      }

      // 2. Try DB Dyeing Details
      const dbRes = await store.fetchDyeingLotDetails(cleanLot);
      if (dbRes && dbRes.success && dbRes.data) {
        const d = dbRes.data;
        setFormData(prev => ({
          ...prev,
          cmfName: d.cmfName || prev.cmfName,
          fabricName: d.fabricName || prev.fabricName,
          shade: d.issuedShade || d.shade || prev.shade,
          group: d.group || prev.group,
          billNumber: d.billNumber || prev.billNumber,
          date: d.date || prev.date
        }));
        setLotFoundSource('Database Cache');
        showToast(`✓ Retrieved Lot ${cleanLot} details from database!`, 'success');
        loadRecentRolls(cleanLot);
        return;
      }

      showToast(`No existing records for Lot "${cleanLot}". Enter details manually.`, 'info');
      setLotFoundSource(null);
    } catch (err) {
      console.warn('Error fetching lot details:', err);
      showToast('Could not fetch lot details automatically. Please enter manually.', 'info');
    } finally {
      setFetchingLot(false);
    }
  };

  // Roll Grid Management
  const addRollRow = () => {
    setRolls(prev => {
      const nextNum = prev.length + 1;
      return [...prev, { id: Date.now() + Math.random(), rollNumber: nextNum, weight: '', barcodeId: '' }];
    });
  };

  const removeRollRow = (idx) => {
    if (rolls.length <= 1) {
      showToast('At least one roll is required', 'warning');
      return;
    }
    setRolls(prev => {
      const filtered = prev.filter((_, i) => i !== idx);
      return filtered.map((r, i) => ({ ...r, rollNumber: i + 1 }));
    });
  };

  const updateRollWeight = (idx, weightVal) => {
    setRolls(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], weight: weightVal };
      return updated;
    });
  };

  const handleRollCountChange = (count) => {
    const num = Math.max(1, Math.min(100, parseInt(count) || 1));
    setRolls(prev => {
      if (num === prev.length) return prev;
      if (num > prev.length) {
        const added = [];
        for (let i = prev.length + 1; i <= num; i++) {
          added.push({ id: Date.now() + i, rollNumber: i, weight: '', barcodeId: '' });
        }
        return [...prev, ...added];
      } else {
        return prev.slice(0, num);
      }
    });
  };

  // Quick Paste Weights Logic
  const handleApplyPastedWeights = () => {
    if (!pasteInputText.trim()) {
      setShowPasteModal(false);
      return;
    }

    // Extract all numbers (including decimals) from pasted text
    const matches = pasteInputText.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (!matches || matches.length === 0) {
      showToast('No valid numeric weights found in pasted text', 'error');
      return;
    }

    const validWeights = matches
      .map(w => parseFloat(w))
      .filter(w => !isNaN(w) && w > 0);

    if (validWeights.length === 0) {
      showToast('No valid positive weights found', 'error');
      return;
    }

    const newRolls = validWeights.map((w, idx) => ({
      id: Date.now() + idx,
      rollNumber: idx + 1,
      weight: w.toFixed(2),
      barcodeId: ''
    }));

    setRolls(newRolls);
    setShowPasteModal(false);
    setPasteInputText('');
    showToast(`✓ Successfully populated ${newRolls.length} rolls with pasted weights!`, 'success');
  };

  // Keyboard navigation: Enter in roll weight jumps to next row
  const handleWeightKeyDown = (e, idx) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx < rolls.length - 1) {
        if (weightInputRefs.current[idx + 1]) {
          weightInputRefs.current[idx + 1].focus();
        }
      } else {
        // At the last row: automatically add a new row and focus it!
        addRollRow();
        setTimeout(() => {
          if (weightInputRefs.current[idx + 1]) {
            weightInputRefs.current[idx + 1].focus();
          }
        }, 50);
      }
    }
  };

  // Statistics Calculation
  const stats = useMemo(() => {
    const validRolls = rolls.filter(r => parseFloat(r.weight) > 0);
    const totalRolls = rolls.length;
    const rollsWithWeight = validRolls.length;
    const totalWeight = validRolls.reduce((acc, r) => acc + parseFloat(r.weight), 0);
    const avgWeight = rollsWithWeight > 0 ? (totalWeight / rollsWithWeight) : 0;
    const weightsList = validRolls.map(r => parseFloat(r.weight));
    const minWeight = weightsList.length > 0 ? Math.min(...weightsList) : 0;
    const maxWeight = weightsList.length > 0 ? Math.max(...weightsList) : 0;

    return {
      totalRolls,
      rollsWithWeight,
      totalWeight,
      avgWeight,
      minWeight,
      maxWeight
    };
  }, [rolls]);

  // Save All Rolls to Stock
  const handleSaveAllRolls = async (andPrint = false) => {
    if (!formData.lotNumber.trim()) {
      showToast('Please enter Lot Number', 'error');
      return;
    }
    if (!formData.fabricName.trim()) {
      showToast('Please enter Fabric Name', 'error');
      return;
    }
    if (!formData.shade.trim()) {
      showToast('Please enter Shade / Color', 'error');
      return;
    }
    if (!formData.location.trim()) {
      showToast('Please specify Storage Location', 'error');
      return;
    }

    const validRolls = rolls.filter(r => parseFloat(r.weight) > 0);
    if (validRolls.length === 0) {
      showToast('Please enter manual weight for at least 1 roll', 'error');
      return;
    }

    setSaving(true);
    setSaveProgress(0);

    const savedStickers = [];
    const dateStr = formData.date || new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString();
    const batchId = `BATCH-${formData.lotNumber}-${Date.now()}`;

    try {
      for (let i = 0; i < validRolls.length; i++) {
        const roll = validRolls[i];
        setSaveProgress(Math.round(((i + 1) / validRolls.length) * 100));

        // Get fresh next sequential barcode
        let barcodeId = '';
        try {
          const bRes = await store.getNextBarcodeId();
          if (bRes && bRes.data && bRes.data.barcodeId) {
            barcodeId = bRes.data.barcodeId;
          }
        } catch (be) {
          console.warn('Barcode gen error, using local fallback:', be);
        }

        if (!barcodeId) {
          barcodeId = `DYE${Date.now().toString().slice(-6)}${i + 1}`;
        }

        const payload = {
          barcodeId: barcodeId,
          batchNumber: batchId,
          batchDate: dateStr,
          batchTime: timeStr,
          cmfName: formData.cmfName || 'Dyeing Mill',
          fabricName: formData.fabricName,
          shade: formData.shade,
          lotNumber: formData.lotNumber,
          group: formData.group || 'Dyeing Fabric',
          billNumber: formData.billNumber || '',
          date: dateStr,
          location: formData.location,
          receivedPerson: formData.receivedPerson || currentUser?.name || 'Operator',
          authorizedPerson: formData.authorizedPerson || 'Supervisor',
          rollNumber: roll.rollNumber,
          batchTotal: validRolls.length,
          weight: parseFloat(roll.weight).toFixed(2),
          generatedAt: timeStr,
          timestamp: new Date().toISOString(),
          status: 'in_stock'
        };

        const res = await store.storeDyeingData(payload);
        if (!res || !res.success) {
          throw new Error(res?.message || `Failed to save roll #${roll.rollNumber}`);
        }

        savedStickers.push(payload);
      }

      showToast(`🎉 Successfully saved ${validRolls.length} dyeing rolls to stock!`, 'success');
      loadRecentRolls(formData.lotNumber);
      loadNextBarcode();

      // Reset rolls or prepare for sticker print
      if (andPrint && savedStickers.length > 0) {
        setStickerDataList(savedStickers);
        setSelectedStickerIdx(0);
        setPrintModalOpen(true);
      }

      // Reset roll weights for next entry
      setRolls(prev => prev.map(r => ({ ...r, weight: '' })));
    } catch (error) {
      console.error('Error saving dyeing rolls:', error);
      showToast(`Save failed: ${error.message}`, 'error');
    } finally {
      setSaving(false);
      setSaveProgress(0);
    }
  };

  // Open sticker modal for an existing roll from history
  const handleOpenExistingSticker = (item) => {
    setStickerDataList([item]);
    setSelectedStickerIdx(0);
    setPrintModalOpen(true);
  };

  // Delete a dyeing roll from history
  const handleDeleteRoll = async (id, barcodeId) => {
    if (!window.confirm(`Are you sure you want to delete roll (${barcodeId}) from stock?`)) {
      return;
    }
    try {
      const res = await store.deleteDyeingMaterial(id);
      if (res && res.success) {
        showToast(`✓ Roll ${barcodeId} deleted from stock`, 'success');
        loadRecentRolls(formData.lotNumber);
      } else {
        showToast(res?.message || 'Delete failed', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Error deleting roll', 'error');
    }
  };

  // Barcode SVG Renderer Component
  const BarcodeDisplay = ({ value }) => {
    const svgRef = useRef(null);
    useEffect(() => {
      if (svgRef.current && value) {
        try {
          JsBarcode(svgRef.current, value, {
            format: 'CODE128',
            width: 1.8,
            height: 38,
            displayValue: true,
            fontSize: 12,
            font: 'monospace',
            margin: 0
          });
        } catch (e) {
          console.error('Barcode render error:', e);
        }
      }
    }, [value]);

    return <svg ref={svgRef} style={{ maxWidth: '100%' }} />;
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return recentDyeingRolls;
    const q = historySearch.toLowerCase();
    return recentDyeingRolls.filter(r =>
      (r.barcodeId && r.barcodeId.toLowerCase().includes(q)) ||
      (r.lotNumber && r.lotNumber.toLowerCase().includes(q)) ||
      (r.fabricName && r.fabricName.toLowerCase().includes(q)) ||
      (r.shade && r.shade.toLowerCase().includes(q)) ||
      (r.location && r.location.toLowerCase().includes(q))
    );
  }, [recentDyeingRolls, historySearch]);

  return (
    <div className="dyeing-manual-app" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      {/* Styles Injection */}
      <style>{`
        .dyeing-manual-app {
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: var(--text-primary, #0F172A);
        }
        .premium-card {
          background: var(--surface, #ffffff) !important;
          border: 1px solid var(--border, rgba(37, 99, 235, 0.12)) !important;
          box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.04) !important;
          border-radius: 12px !important;
        }
        .dark .premium-card {
          background: #1E293B !important;
          border-color: #334155 !important;
          box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.25) !important;
        }
        .card-header-styled {
          padding: 12px 18px !important;
          background: var(--card-header-bg, rgba(37, 99, 235, 0.03)) !important;
          border-bottom: 1px solid var(--border, rgba(37, 99, 235, 0.1)) !important;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dark .card-header-styled {
          background: rgba(30, 41, 59, 0.7) !important;
          border-color: #334155 !important;
        }
        .modern-input {
          height: 38px;
          border-radius: 8px;
          border: 1px solid #CBD5E1;
          padding: 0 12px;
          font-size: 13px;
          color: inherit;
          background: var(--surface, #ffffff);
          transition: all 0.2s ease;
          width: 100%;
        }
        .modern-input:focus {
          border-color: #2563EB;
          outline: none;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        .dark .modern-input {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }
        .weight-input-highlight {
          font-size: 16px !important;
          font-weight: 800 !important;
          color: #2563EB !important;
          text-align: right;
          background: rgba(37, 99, 235, 0.03) !important;
        }
        .dark .weight-input-highlight {
          color: #60A5FA !important;
          background: rgba(37, 99, 235, 0.1) !important;
        }
        .kpi-chip {
          padding: 12px 16px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(37, 99, 235, 0.05);
          border: 1px solid rgba(37, 99, 235, 0.15);
        }
        .custom-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }
        .custom-table th {
          background: #F1F5F9;
          color: #334155;
          font-weight: 800;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.5px;
          padding: 10px 14px;
          border: 1px solid #E2E8F0;
        }
        .dark .custom-table th {
          background: #0F172A;
          color: #94A3B8;
          border-color: #334155;
        }
        .custom-table td {
          padding: 8px 12px;
          border: 1px solid #E2E8F0;
          color: inherit;
        }
        .dark .custom-table td {
          border-color: #334155;
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-sticker-area, .printable-sticker-area * {
            visibility: visible;
          }
          .printable-sticker-area {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        }
      `}</style>

      {/* Top Breadcrumb & Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: '#64748B', fontWeight: 650 }}>
            <span>Home</span>
            <span>/</span>
            <span>Stock Add</span>
            <span>/</span>
            <span style={{ color: '#2563EB', fontWeight: 800 }}>Dyeing Material (Manual Weight)</span>
          </div>
          <h1 style={{ fontSize: '24px', marginTop: 4, color: 'var(--text-primary)', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Droplets size={26} style={{ color: '#2563EB' }} />
            <span>Dyeing Material Inward</span>
            <span style={{ fontSize: '11px', background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: 6, fontWeight: 800, textTransform: 'uppercase' }}>
              Manual Weight Mode
            </span>
          </h1>
          <p style={{ fontSize: '12.5px', marginTop: 2, color: '#64748B' }}>
            Direct manual weight entry for fabric rolls received from dyeing mills — no physical electronic scale required.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setFormData({
                lotNumber: '',
                cmfName: '',
                fabricName: '',
                group: '',
                shade: '',
                billNumber: '',
                date: new Date().toISOString().split('T')[0],
                location: '',
                receivedPerson: currentUser?.name || 'Dyeing Operator',
                authorizedPerson: 'Store Manager',
              });
              setRolls([{ id: 1, rollNumber: 1, weight: '', barcodeId: '' }]);
              setLotFoundSource(null);
              showToast('Form cleared', 'info');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, height: 36, fontWeight: 700 }}
          >
            <RefreshCw size={13} />
            <span>Clear Form</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleSaveAllRolls(true)}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, height: 36, fontWeight: 800 }}
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="spin-animation" />
                <span>Saving ({saveProgress}%)...</span>
              </>
            ) : (
              <>
                <Printer size={14} />
                <span>Save & Print Stickers</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Form Left, Roll Table Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.55fr', gap: 16 }}>

        {/* Left Column: Metadata & Lot Card */}
        <div className="card premium-card" style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
          <div className="card-header-styled">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 4, height: 14, background: '#2563EB', borderRadius: 2 }} />
              <span style={{ fontSize: '13.5px', fontWeight: 850 }}>1. Dyeing Lot & Metadata</span>
            </div>
            {lotFoundSource && (
              <span style={{ fontSize: '10px', background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>
                ✓ {lotFoundSource}
              </span>
            )}
          </div>

          <div className="card-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Lot Number with Search Button */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                Dyeing Lot Number <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    name="lotNumber"
                    className="modern-input"
                    style={{ paddingLeft: 32, fontWeight: 800, letterSpacing: '0.3px' }}
                    placeholder="e.g. 76038 or DY-902"
                    value={formData.lotNumber}
                    onChange={handleFormChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleFetchLotDetails();
                      }
                    }}
                  />
                  <Hash size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#2563EB' }} />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleFetchLotDetails()}
                  disabled={fetchingLot || !formData.lotNumber.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '0 12px', fontWeight: 750 }}
                  title="Search Lot from Google Sheets and previous records"
                >
                  <Search size={13} className={fetchingLot ? 'spin-animation' : ''} />
                  <span>{fetchingLot ? 'Searching...' : 'Lookup'}</span>
                </button>
              </div>
            </div>

            {/* CMF / Mill & Fabric Description */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  CMF / Dyeing Mill <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <MasterDropdown
                  type="party"
                  value={formData.cmfName}
                  onChange={(val) => setFormData(prev => ({ ...prev, cmfName: val }))}
                  placeholder="Select or add Party..."
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Fabric Description <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <MasterDropdown
                  type="fabric"
                  value={formData.fabricName}
                  onChange={(val) => setFormData(prev => ({ ...prev, fabricName: val }))}
                  placeholder="Select or add Fabric..."
                />
              </div>
            </div>

            {/* Shade & Group */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Shade / Color <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <MasterDropdown
                  type="shade"
                  value={formData.shade}
                  onChange={(val) => setFormData(prev => ({ ...prev, shade: val }))}
                  placeholder="Select or add Shade..."
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Group / GSM
                </label>
                <MasterDropdown
                  type="category"
                  value={formData.group}
                  onChange={(val) => setFormData(prev => ({ ...prev, group: val }))}
                  placeholder="Select or add Group..."
                />
              </div>
            </div>

            {/* Bill No & Inward Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Challan / Bill No
                </label>
                <input
                  type="text"
                  name="billNumber"
                  className="modern-input"
                  placeholder="e.g. CH-99120"
                  value={formData.billNumber}
                  onChange={handleFormChange}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Received Date <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  className="modern-input"
                  value={formData.date}
                  onChange={handleFormChange}
                />
              </div>
            </div>

            {/* Storage Location Picker */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                Warehouse Storage Shelf Location <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <LocationPicker
                value={formData.location}
                onChange={(loc) => setFormData(prev => ({ ...prev, location: loc }))}
              />
            </div>

            {/* Operator and Supervisor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Received By
                </label>
                <MasterDropdown
                  type="person"
                  value={formData.receivedPerson}
                  onChange={(val) => setFormData(prev => ({ ...prev, receivedPerson: val }))}
                  placeholder="Select or add Person..."
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                  Authorized By
                </label>
                <MasterDropdown
                  type="person"
                  value={formData.authorizedPerson}
                  onChange={(val) => setFormData(prev => ({ ...prev, authorizedPerson: val }))}
                  placeholder="Select or add Person..."
                />
              </div>
            </div>

            {/* Next Barcode Info */}
            <div style={{ marginTop: 6, padding: '10px 14px', background: 'rgba(37, 99, 235, 0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(37, 99, 235, 0.15)' }}>
              <div>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Next Sequential Barcode</span>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#2563EB', fontFamily: 'monospace' }}>
                  {nextSeqBarcode || 'MAT-----'}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadNextBarcode}
                style={{ height: 28, fontSize: '11px', padding: '0 8px', borderRadius: 6 }}
              >
                Sync
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Manual Weight Entry Grid */}
        <div className="card premium-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="card-header-styled">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 4, height: 14, background: '#10B981', borderRadius: 2 }} />
              <span style={{ fontSize: '13.5px', fontWeight: 850 }}>2. Manual Roll Weights Entry</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Quick Roll Count Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 750 }}>
                <span style={{ color: '#64748B' }}>Rolls:</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={rolls.length}
                  onChange={(e) => handleRollCountChange(e.target.value)}
                  style={{ width: 48, height: 26, borderRadius: 6, border: '1px solid #CBD5E1', textAlign: 'center', fontWeight: 800 }}
                />
              </div>

              {/* Paste Weights Modal Trigger */}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPasteModal(true)}
                style={{ height: 28, fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: 4, borderRadius: 6 }}
                title="Paste comma-separated or newline-separated list of weights"
              >
                <Clipboard size={12} />
                <span>Paste Weights</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addRollRow}
                style={{ height: 28, fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: 4, borderRadius: 6 }}
              >
                <Plus size={13} />
                <span>Add Row</span>
              </button>
            </div>
          </div>

          <div className="card-body" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* KPI Summary Chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div className="kpi-chip">
                <div style={{ background: '#DBEAFE', color: '#1E40AF', padding: 8, borderRadius: 8 }}>
                  <Layers size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800 }}>ROLLS</div>
                  <div style={{ fontSize: '16px', fontWeight: 900 }}>
                    {stats.rollsWithWeight} / {stats.totalRolls}
                  </div>
                </div>
              </div>

              <div className="kpi-chip">
                <div style={{ background: '#D1FAE5', color: '#065F46', padding: 8, borderRadius: 8 }}>
                  <Scale size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800 }}>TOTAL WEIGHT</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#10B981' }}>
                    {stats.totalWeight.toFixed(1)} <span style={{ fontSize: 11 }}>KG</span>
                  </div>
                </div>
              </div>

              <div className="kpi-chip">
                <div style={{ background: '#FEF3C7', color: '#92400E', padding: 8, borderRadius: 8 }}>
                  <Sparkles size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800 }}>AVG ROLL</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#D97706' }}>
                    {stats.avgWeight.toFixed(1)} <span style={{ fontSize: 11 }}>KG</span>
                  </div>
                </div>
              </div>

              <div className="kpi-chip">
                <div style={{ background: '#F3E8FF', color: '#6B21A8', padding: 8, borderRadius: 8 }}>
                  <Package size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800 }}>MIN - MAX</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, marginTop: 2 }}>
                    {stats.minWeight.toFixed(1)} - {stats.maxWeight.toFixed(1)} <span style={{ fontSize: 9.5 }}>KG</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Instruction Tip */}
            <div style={{ fontSize: '11px', color: '#64748B', background: 'rgba(100, 116, 139, 0.05)', padding: '6px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>💡</span>
              <span>Tip: Type weight for each roll and press <strong>Enter</strong> to automatically jump to next row!</span>
            </div>

            {/* Multi-Roll Spreadsheet-Style Table */}
            <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, overflow: 'hidden', maxHeight: 380, overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: 60, textAlign: 'center' }}>Roll #</th>
                    <th style={{ textAlign: 'right' }}>Manual Weight (KG) <span style={{ color: '#EF4444' }}>*</span></th>
                    <th style={{ textAlign: 'left' }}>Barcode Preview</th>
                    <th style={{ textAlign: 'left' }}>Location</th>
                    <th style={{ width: 44, textAlign: 'center' }}>Act</th>
                  </tr>
                </thead>
                <tbody>
                  {rolls.map((roll, idx) => (
                    <tr key={roll.id}>
                      <td style={{ textAlign: 'center', fontWeight: 800, color: '#2563EB' }}>
                        #{roll.rollNumber}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            ref={(el) => { weightInputRefs.current[idx] = el; }}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="modern-input weight-input-highlight"
                            style={{ height: 34, paddingRight: 32 }}
                            value={roll.weight}
                            onChange={(e) => updateRollWeight(idx, e.target.value)}
                            onKeyDown={(e) => handleWeightKeyDown(e, idx)}
                          />
                          <span style={{ position: 'absolute', right: 8, fontSize: '11px', fontWeight: 800, color: '#94A3B8' }}>
                            KG
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'monospace', color: '#64748B' }}>
                        {nextSeqBarcode ? (
                          <span style={{ background: 'rgba(37, 99, 235, 0.08)', padding: '2px 6px', borderRadius: 4, color: '#2563EB', fontWeight: 700 }}>
                            {nextSeqBarcode.slice(0, 3)}{String(parseInt(nextSeqBarcode.slice(3) || '0') + idx).padStart(5, '0')}
                          </span>
                        ) : (
                          'Auto-assigned'
                        )}
                      </td>
                      <td style={{ fontSize: '11.5px', color: '#475569', fontWeight: 650 }}>
                        {formData.location || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Pending</span>}
                      </td>
                      <td style={{ textAlign: 'center', padding: '4px' }}>
                        <button
                          type="button"
                          onClick={() => removeRollRow(idx)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#94A3B8',
                            cursor: 'pointer',
                            padding: 4,
                            borderRadius: 4
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
                          title="Remove Row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addRollRow}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              >
                <Plus size={14} />
                <span>Add Another Roll</span>
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSaveAllRolls(false)}
                  disabled={saving || stats.rollsWithWeight === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 750 }}
                >
                  <Save size={14} />
                  <span>Save to Stock Only</span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSaveAllRolls(true)}
                  disabled={saving || stats.rollsWithWeight === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, padding: '0 18px', height: 38 }}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={14} className="spin-animation" />
                      <span>Saving Roll {saveProgress}%...</span>
                    </>
                  ) : (
                    <>
                      <Printer size={15} />
                      <span>Save & Print ({stats.rollsWithWeight} Rolls)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Recent Dyeing Inward Records (Today's Receiving Log) */}
      <div className="card premium-card" style={{ marginTop: 6, overflow: 'hidden' }}>
        <div className="card-header-styled">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 14, background: '#8B5CF6', borderRadius: 2 }} />
            <span style={{ fontSize: '13.5px', fontWeight: 850 }}>Recent Dyeing Inward Log</span>
            <span style={{ fontSize: '11px', background: 'rgba(139, 92, 246, 0.1)', color: '#7C3AED', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>
              {filteredHistory.length} Record(s)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Filter lot, barcode, shade..."
                className="modern-input"
                style={{ height: 30, width: 220, paddingLeft: 28, fontSize: '12px' }}
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => loadRecentRolls(formData.lotNumber)}
              disabled={loadingHistory}
              style={{ height: 30, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4, borderRadius: 6 }}
            >
              <RefreshCw size={12} className={loadingHistory ? 'spin-animation' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {loadingHistory ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748B' }}>
              <RefreshCw size={24} className="spin-animation" style={{ margin: '0 auto 8px', color: '#2563EB' }} />
              <div>Loading recent dyeing material inward records...</div>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              No recent dyeing inward rolls found. Fill the form above and click Save to add materials.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table" style={{ border: 'none' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Barcode</th>
                    <th style={{ textAlign: 'left' }}>Lot #</th>
                    <th style={{ textAlign: 'left' }}>CMF / Mill</th>
                    <th style={{ textAlign: 'left' }}>Fabric & Shade</th>
                    <th style={{ textAlign: 'right' }}>Weight (KG)</th>
                    <th style={{ textAlign: 'left' }}>Location</th>
                    <th style={{ textAlign: 'left' }}>Date</th>
                    <th style={{ textAlign: 'center', width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 800, fontFamily: 'monospace', color: '#2563EB' }}>
                        {item.barcodeId}
                      </td>
                      <td style={{ fontWeight: 800 }}>
                        <span style={{ background: '#DBEAFE', color: '#1E40AF', padding: '2px 6px', borderRadius: 4, fontSize: '11px' }}>
                          {item.lotNumber}
                        </span>
                      </td>
                      <td style={{ color: '#475569' }}>{item.cmfName || '—'}</td>
                      <td>
                        <div style={{ fontWeight: 750 }}>{item.fabricName}</div>
                        <div style={{ fontSize: '10.5px', color: '#64748B' }}>{item.shade || '—'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 900, color: '#10B981', fontSize: '13px' }}>
                        {parseFloat(item.weight || 0).toFixed(2)} KG
                      </td>
                      <td style={{ fontSize: '11.5px', color: '#475569' }}>
                        {item.location || '—'}
                      </td>
                      <td style={{ fontSize: '11.5px', color: '#64748B' }}>
                        {item.date || '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenExistingSticker(item)}
                            style={{ height: 26, padding: '0 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}
                            title="Print Barcode Sticker"
                          >
                            <Printer size={12} />
                            <span>Sticker</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRoll(item.id, item.barcodeId)}
                            style={{
                              border: 'none',
                              background: '#FEE2E2',
                              color: '#DC2626',
                              cursor: 'pointer',
                              padding: '2px 8px',
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Delete Roll"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick Paste Weights Modal */}
      {showPasteModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div className="card premium-card" style={{ width: 480, maxWidth: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clipboard size={18} style={{ color: '#2563EB' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Paste Roll Weights</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0 }}>
              Paste roll weights copied from WhatsApp, Excel, or notes. Numbers can be separated by commas, spaces, or newlines.
            </p>

            <textarea
              rows={6}
              className="modern-input"
              style={{ height: 'auto', padding: 10, fontFamily: 'monospace', fontSize: '13px' }}
              placeholder={"Example:\n23.4\n24.1\n22.8\n25.0\n\nOr: 23.4, 24.1, 22.8, 25.0"}
              value={pasteInputText}
              onChange={(e) => setPasteInputText(e.target.value)}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPasteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleApplyPastedWeights}
                style={{ fontWeight: 800 }}
              >
                Populate Rolls
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Sticker Print Modal */}
      {printModalOpen && stickerDataList.length > 0 && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(5px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div className="card premium-card" style={{ width: 560, maxWidth: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Printer size={18} style={{ color: '#2563EB' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 900 }}>Fabric Roll Barcode Sticker</h3>
              </div>
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Sticker Selector (if multiple rolls) */}
            {stickerDataList.length > 1 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
                {stickerDataList.map((st, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedStickerIdx(idx)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: '11px',
                      fontWeight: 800,
                      border: selectedStickerIdx === idx ? '2px solid #2563EB' : '1px solid #CBD5E1',
                      background: selectedStickerIdx === idx ? '#EFF6FF' : 'transparent',
                      color: selectedStickerIdx === idx ? '#1E40AF' : 'inherit',
                      cursor: 'pointer'
                    }}
                  >
                    Roll #{st.rollNumber} ({st.barcodeId})
                  </button>
                ))}
              </div>
            )}

            {/* Printable Sticker Preview Card (4x2 Standard Thermal Layout) */}
            <div className="printable-sticker-area" style={{ display: 'flex', justifyContent: 'center' }}>
              {(() => {
                const item = stickerDataList[selectedStickerIdx] || stickerDataList[0];
                return (
                  <div style={{
                    width: '380px',
                    border: '2px solid #000000',
                    borderRadius: 6,
                    padding: 12,
                    background: '#FFFFFF',
                    color: '#000000',
                    fontFamily: 'Arial, sans-serif'
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: 4, marginBottom: 8 }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px' }}>
                        TEXTILE WAREHOUSE ERP
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 800, border: '1px solid #000', padding: '1px 5px', borderRadius: 3 }}>
                        DYEING INWARD
                      </span>
                    </div>

                    {/* Barcode & QR Code Section */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '4px 0 8px' }}>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <BarcodeDisplay value={item.barcodeId} />
                      </div>
                      <div style={{ flexShrink: 0, padding: 3, border: '1px solid #ccc', borderRadius: 4 }}>
                        <QRCodeSVG value={`MAT:${item.barcodeId}|LOT:${item.lotNumber}|WT:${item.weight}`} size={56} />
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', fontSize: '10.5px', borderTop: '1px dashed #666', paddingTop: 6 }}>
                      <div><strong>Lot No:</strong> {item.lotNumber}</div>
                      <div><strong>Roll No:</strong> #{item.rollNumber} of {item.batchTotal || 1}</div>
                      <div><strong>Fabric:</strong> {item.fabricName}</div>
                      <div><strong>Shade:</strong> {item.shade}</div>
                      <div><strong>CMF:</strong> {item.cmfName || '—'}</div>
                      <div><strong>Challan:</strong> {item.billNumber || '—'}</div>
                      <div><strong>Location:</strong> {item.location}</div>
                      <div><strong>Date:</strong> {item.date}</div>
                    </div>

                    {/* Net Weight High-Contrast Banner */}
                    <div style={{
                      marginTop: 8,
                      background: '#000000',
                      color: '#FFFFFF',
                      textAlign: 'center',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: '14px',
                      fontWeight: 900,
                      letterSpacing: '0.5px'
                    }}>
                      NET WEIGHT: {parseFloat(item.weight).toFixed(2)} KG
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                Printing roll {selectedStickerIdx + 1} of {stickerDataList.length}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPrintModalOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}
                >
                  <Printer size={14} />
                  <span>Print Sticker</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 999999,
          background: toast.type === 'error' ? '#EF4444' : toast.type === 'success' ? '#10B981' : '#0F172A',
          color: '#FFFFFF',
          padding: '12px 20px',
          borderRadius: 10,
          boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '13px',
          fontWeight: 750,
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : toast.type === 'error' ? <AlertCircle size={16} /> : null}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

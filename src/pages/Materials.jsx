import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../store.js';
import { Plus, Search, Edit, Trash2, Eye, Package, Filter, Download, QrCode, X, AlertTriangle, ArrowLeft, FileSpreadsheet, FileText } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import LocationPicker from '../components/LocationPicker.jsx';
import * as XLSX from 'xlsx-js-style';

// Custom Soft & Premium Multi-Select Dropdown Component
function MultiSelect({ label, options, selectedValues, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  // Close dropdown on clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filteredOptions = options.filter(opt =>
    String(opt).toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (val) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleSelectAll = () => {
    if (selectedValues.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  return (
    <div className="multiselect-container" ref={containerRef} style={{ position: 'relative', minWidth: '160px', zIndex: isOpen ? 101 : 1 }}>
      <button
        type="button"
        className="multiselect-trigger-btn"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
          cursor: 'pointer',
          background: 'var(--bg, #F8FAFC)',
          border: isOpen ? '1.5px solid #2563EB' : '1.5px solid var(--border, #E2E8F0)',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '12.5px',
          fontWeight: '600',
          color: selectedValues.length > 0 ? '#2563EB' : 'var(--text-primary, #0F172A)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
          boxSizing: 'border-box'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedValues.length === 0
            ? placeholder
            : `${label} (${selectedValues.length})`}
        </span>
        <span style={{ fontSize: '10px', color: '#94A3B8', marginLeft: '6px' }}>▼</span>
      </button>

      {isOpen && (
        <div className="multiselect-dropdown" style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          marginTop: '4px',
          maxHeight: '260px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px'
        }}>
          {options.length > 5 && (
            <input
              type="text"
              placeholder="Search..."
              className="form-control"
              style={{
                fontSize: '12px',
                padding: '6px 8px',
                marginBottom: '8px',
                height: 'auto'
              }}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px 6px 4px', borderBottom: '1px solid var(--border)', marginBottom: '6px' }}>
            <button
              type="button"
              className="btn btn-link btn-xs"
              style={{ padding: 0, fontSize: '11px', textDecoration: 'none' }}
              onClick={(e) => { e.stopPropagation(); handleSelectAll(); }}
            >
              {selectedValues.length === options.length ? 'Clear All' : 'Select All'}
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {filteredOptions.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>No options found</span>
            ) : (
              filteredOptions.map(opt => {
                const isChecked = selectedValues.includes(opt);
                return (
                  <label
                    key={opt}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: isChecked ? 'rgba(26, 86, 219, 0.05)' : 'transparent',
                      transition: 'background 0.15s ease',
                      userSelect: 'none',
                      margin: 0
                    }}
                    className="multiselect-option-label"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOption(opt)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


const CATEGORIES = ['Summer Fabric', 'Winter Fabric', 'Accessories'];
const SUB_CATS = {
  'Summer Fabric': ['Plain Cotton', 'Woven', 'Viscose Lining', 'Double Knit', 'Cotton Twill', 'Interlock'],
  'Winter Fabric': ['Rib Knit', 'Polar Fleece', 'Heavy Denim', 'Woolen'],
  'Accessories': ['Plastic Buttons', 'Metal Zippers', 'Threads', 'Labels', 'Elastic'],
};
const UNITS = ['Roll', 'MTR', 'Kg'];

function MaterialForm({ material, suppliers, categories = [], subcategories = [], onSave, onClose }) {
  const [form, setForm] = useState(material ? { ...material, lotNo: material.lotNo || '' } : {
    name: '',
    category: categories[0] || '',
    subCategory: subcategories[0] || '',
    color: '',
    supplier: '',
    weight: '',
    rolls: '',
    unit: 'Roll',
    location: '',
    status: 'Active',
    lotNo: '',
  });
  const isEdit = !!material?.id;
  const [shelves, setShelves] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([store.getShelves(), store.getRooms()])
      .then(([s, r]) => {
        setShelves(s || []);
        setRooms(r || []);
      })
      .catch(console.error);
  }, []);

  const reqRolls = parseInt(form.rolls) || 0;
  const targetRoom = rooms.find(r => r.category === form.category);
  const recommendedShelves = shelves
    .map(s => {
      const currentMatRolls = (isEdit && material?.location === s.id) ? (material.rolls || 0) : 0;
      const freeSpace = s.capacity - s.used + currentMatRolls;
      const roomMatch = targetRoom ? s.room === targetRoom.id : false;
      return { ...s, freeSpace, roomMatch };
    })
    .filter(s => s.freeSpace >= reqRolls)
    .sort((a, b) => {
      if (a.roomMatch !== b.roomMatch) {
        return a.roomMatch ? -1 : 1;
      }
      return a.freeSpace - b.freeSpace;
    });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.name || !form.category || !form.supplier) {
      setError('Please fill required fields.');
      return;
    }
    const formattedForm = {
      ...form,
      weight: parseFloat(form.weight) || 0,
      rolls: parseInt(form.rolls) || 0,
      stockKg: parseFloat(form.weight) || 0
    };
    try {
      if (isEdit) {
        await store.updateMaterial(material.id, formattedForm);
      } else {
        await store.addMaterial(formattedForm);
      }
      onSave();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <div className="modal-title"><Package size={18} /> {isEdit ? 'Edit Material' : 'Add New Material'}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="form-grid form-grid-3" style={{ gap: 16 }}>
            {isEdit && (
              <div className="form-group">
                <label className="form-label">Material Code</label>
                <input className="form-control" value={form.code || ''} disabled />
              </div>
            )}
            <div className="form-group" style={isEdit ? {} : { gridColumn: 'span 1' }}>
              <label className="form-label">Material Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Cotton Fabric" />
            </div>
            <div className="form-group">
              <label className="form-label">Category <span className="required">*</span></label>
              <input
                list="form-categories"
                className="form-control"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="Select or type Category"
              />
              <datalist id="form-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Sub Category</label>
              <input
                list="form-subcategories"
                className="form-control"
                value={form.subCategory}
                onChange={e => set('subCategory', e.target.value)}
                placeholder="Select or type Sub Category"
              />
              <datalist id="form-subcategories">
                {subcategories.map(sc => <option key={sc} value={sc} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <input className="form-control" value={form.color} onChange={e => set('color', e.target.value)} placeholder="e.g. White, Blue" />
            </div>
            <div className="form-group">
              <label className="form-label">Lot Number</label>
              <input className="form-control" value={form.lotNo} onChange={e => set('lotNo', e.target.value)} placeholder="e.g. LOT-101" />
            </div>
            <div className="form-group">
              <label className="form-label">Supplier <span className="required">*</span></label>
              <select className="form-control" value={form.supplier} onChange={e => set('supplier', parseInt(e.target.value))}>
                <option value="">Select Supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{form.unit === 'MTR' ? 'Meters (Mtr)' : 'Weight (Kg)'}</label>
              <input className="form-control" type="number" value={form.weight} onChange={e => set('weight', parseFloat(e.target.value))} placeholder="e.g. 250" />
            </div>
            <div className="form-group">
              <label className="form-label">Roll Quantity</label>
              <input className="form-control" type="number" value={form.rolls} onChange={e => set('rolls', parseInt(e.target.value))} placeholder="e.g. 10" />
            </div>
            <div className="form-group">
              <label className="form-label">Unit</label>
              <select className="form-control" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 3' }}>
              <label className="form-label">Location</label>
              <LocationPicker
                value={form.location}
                onChange={val => set('location', val)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
                <option>Active</option>
                <option>Low Stock</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" id="save-material-btn" onClick={handleSave}>{isEdit ? 'Update Material' : 'Add Material'}</button>
        </div>
      </div>
    </div>
  );
}

export const printDirectly = (type, data) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:8765');

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'auth',
        token: 'fabric-print-secret-key-2024'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        if (response.type === 'auth_success') {
          ws.send(JSON.stringify({
            type: type,
            data: data
          }));
        } else if (response.type === 'print_result') {
          ws.close();
          if (response.success) {
            resolve(response.message);
          } else {
            reject(new Error(response.message));
          }
        }
      } catch (e) {
        ws.close();
        reject(e);
      }
    };

    ws.onerror = (err) => {
      reject(new Error('Print service offline'));
    };

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        reject(new Error('Print request timed out'));
      }
    }, 3000);
  });
};

export function Barcode({ value, width = 1.5, height = 35, displayValue = false }) {
  const svgRef = useRef(null);
  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: width,
          height: height,
          displayValue: displayValue,
          margin: 0,
          background: "transparent",
          fontSize: 10,
          textMargin: 2
        });
      } catch (e) {
        console.error("Barcode generation error:", e);
      }
    }
  }, [value, width, height, displayValue]);

  return <svg ref={svgRef}></svg>;
}

export function BarcodeModal({ material, onClose }) {
  const [lotNumber, setLotNumber] = useState(material.lotNo || material.code || '');
  const [billNumber, setBillNumber] = useState(material.billNumber || '');
  const [weight, setWeight] = useState(material.weight || '0.00');
  const [receivedDate, setReceivedDate] = useState(material.receivedDate || new Date().toISOString().split('T')[0]);
  const [receivedPerson, setReceivedPerson] = useState(material.receivedPerson || '');
  const [authorizedPerson, setAuthorizedPerson] = useState(material.authorizedPerson || '');

  const formatDateForDisplay = (dateStr) => {
    try {
      if (!dateStr || dateStr === '—') return '—';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const handlePrint = async () => {
    try {
      await printDirectly('print_material', {
        code: material.code,
        name: material.name,
        category: material.category,
        subCategory: material.subCategory || '',
        color: material.color || '',
        weight: weight,
        unit: material.unit || 'Kg',
        location: material.location,
        receivedDate: receivedDate,
        billNumber: billNumber,
        lotNumber: lotNumber,
        receivedPerson: receivedPerson,
        authorizedPerson: authorizedPerson
      });
      alert('✓ Sticker print request sent to Python print service!');
    } catch (err) {
      console.error('Direct print failed:', err);
      alert(`❌ Print Failed: Print service is offline.\n\nPlease start the Python print service by running:\npython python_service/print-service/print_service.py`);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <style>{`
          .barcode-label {
            width: 2.40in;
            height: 1.60in;
            padding: 4px 6px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            background: white;
            color: black;
            font-family: Arial, sans-serif;
          }
          .sticker-table {
            width: 100%;
            border-collapse: collapse;
            font-family: Arial, sans-serif;
            font-size: 5.5pt;
            border: 1px solid black;
          }
          .sticker-table td {
            border: 1px solid black;
            padding: 1px 2px;
            line-height: 1.1;
          }
          .label-cell {
            font-weight: bold;
            width: 30%;
          }
          .val-cell {
            width: 70%;
          }
          .barcode-svg-container {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 2px;
          }
          .barcode-svg-container svg {
            width: 2.10in !important;
            height: 0.35in !important;
            display: block;
          }
          .barcode-footer {
            text-align: center;
            font-size: 5pt;
            color: #555;
            border-top: 1px solid #000;
            padding-top: 1px;
            margin-top: 1px;
            line-height: 1;
          }
        `}</style>
        <div className="modal-header">
          <div className="modal-title"><QrCode size={18} /> Barcode Label — {material.code}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', gap: '20px', flexDirection: 'row', flexWrap: 'wrap', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Form Inputs (Left Column) */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '280px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>Lot Number</label>
              <input className="form-control" style={{ padding: '8px 12px' }} value={lotNumber} onChange={e => setLotNumber(e.target.value)} placeholder="e.g. LOT-4509" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>Bill Number</label>
              <input className="form-control" style={{ padding: '8px 12px' }} value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="e.g. BILL-9921" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>Weight (Kg)</label>
              <input className="form-control" style={{ padding: '8px 12px' }} type="number" step="0.01" value={weight} onChange={e => setWeight(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>Received Date</label>
              <input className="form-control" style={{ padding: '8px 12px' }} type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>Received By</label>
              <input className="form-control" style={{ padding: '8px 12px' }} value={receivedPerson} onChange={e => setReceivedPerson(e.target.value)} placeholder="e.g. John Doe" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '12px' }}>Authorized Person</label>
              <input className="form-control" style={{ padding: '8px 12px' }} value={authorizedPerson} onChange={e => setAuthorizedPerson(e.target.value)} placeholder="e.g. Sarah Smith" />
            </div>
          </div>

          {/* Sticker Preview (Right Column) */}
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: 'auto' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sticker Live Preview</div>
            <div id="barcode-print-area">
              <div className="barcode-label" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <table className="sticker-table">
                  <tbody>
                    <tr>
                      <td className="label-cell">BARCODE ID</td>
                      <td className="val-cell" style={{ fontWeight: 'bold', textAlign: 'center', backgroundColor: '#fef3c7' }}>{material.code}</td>
                    </tr>
                    <tr>
                      <td className="label-cell">CMP</td>
                      <td className="val-cell">{material.category || '—'}</td>
                    </tr>
                    <tr>
                      <td className="label-cell">FABRIC</td>
                      <td className="val-cell">{material.name || '—'}</td>
                    </tr>
                    <tr>
                      <td className="label-cell">GROUP</td>
                      <td className="val-cell">{material.subCategory || '—'}</td>
                    </tr>
                    <tr>
                      <td className="label-cell">SHADE</td>
                      <td className="val-cell">
                        <table style={{ width: '100%', border: 'none', borderCollapse: 'collapse', margin: 0, padding: 0 }}>
                          <tbody>
                            <tr style={{ border: 'none' }}>
                              <td style={{ border: 'none', padding: 0, fontWeight: 'bold', width: '45%' }}>{material.color || '—'}</td>
                              <td style={{ border: 'none', borderLeft: '1px solid black', padding: '0 0 0 4px', fontWeight: 'bold', width: '55%' }}>LOCATION: {material.location || '—'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td className="label-cell">WEIGHT</td>
                      <td className="val-cell">
                        <table style={{ width: '100%', border: 'none', borderCollapse: 'collapse', margin: 0, padding: 0 }}>
                          <tbody>
                            <tr style={{ border: 'none' }}>
                              <td style={{ border: 'none', padding: 0, fontWeight: 'bold', width: '45%' }}>{weight} {material.unit || 'Kg'}</td>
                              <td style={{ border: 'none', borderLeft: '1px solid black', padding: '0 0 0 4px', width: '55%' }}>BILL NO: {billNumber || '—'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td className="label-cell">DATE</td>
                      <td className="val-cell">{receivedDate ? formatDateForDisplay(receivedDate) : '—'}</td>
                    </tr>
                    <tr>
                      <td className="label-cell">LOT NO</td>
                      <td className="val-cell" style={{ fontWeight: 'bold' }}>{lotNumber || '—'}</td>
                    </tr>
                    <tr>
                      <td className="label-cell">RECEIVED BY</td>
                      <td className="val-cell">{receivedPerson || '—'}</td>
                    </tr>
                    <tr>
                      <td className="label-cell">AUTHORIZED</td>
                      <td className="val-cell">{authorizedPerson || '—'}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="barcode-svg-container" style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                  <Barcode value={material.code} width={1.8} height={32} displayValue={true} />
                </div>
                <div className="barcode-footer">
                  Scan Barcode for details
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" id="print-label-btn" onClick={handlePrint}>🖨️ Print Sticker</button>
        </div>
      </div>
    </div>
  );
}

const formatDateToYYYYMMDD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPresetDates = (preset) => {
  const today = new Date();
  const endStr = formatDateToYYYYMMDD(today);
  if (preset === '7days') {
    const past = new Date();
    past.setDate(today.getDate() - 7);
    return { start: formatDateToYYYYMMDD(past), end: endStr };
  }
  if (preset === '30days') {
    const past = new Date();
    past.setDate(today.getDate() - 30);
    return { start: formatDateToYYYYMMDD(past), end: endStr };
  }
  if (preset === 'thisMonth') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: formatDateToYYYYMMDD(firstDay), end: endStr };
  }
  return { start: '', end: '' };
};

export default function Materials() {
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // 300ms debounce for search input to prevent rapid multi-querying
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Global filter options populated from the backend
  const [filterOptions, setFilterOptions] = useState({
    categories: CATEGORIES,
    colors: [],
    locations: [],
    names: [],
    subCategories: [],
    suppliers: []
  });

  // Selected filter states (arrays for multi-select)
  const [selectedCats, setSelectedCats] = useState([]);
  const [selectedSubCats, setSelectedSubCats] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedNames, setSelectedNames] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  
  // Date Presets & Filters (Default to 'all' / All Time to display all records)
  const [activeDatePreset, setActiveDatePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [barcodeSeries, setBarcodeSeries] = useState('All'); // 'All', '9', 'MAT', 'DYE', 'Plain'
  const [skipReAdd, setSkipReAdd] = useState(false);

  const applyDatePreset = (presetKey) => {
    setActiveDatePreset(presetKey);
    const { start, end } = getPresetDates(presetKey);
    setStartDate(start);
    setEndDate(end);
  };

  const [showForm, setShowForm] = useState(false);
  const [editMat, setEditMat] = useState(null);
  const [showQR, setShowQR] = useState(null);

  const navigate = useNavigate();

  // Load suppliers once on component mount
  useEffect(() => {
    store.getSuppliers().then(setSuppliers).catch(console.error);
  }, []);

  const abortRef = useRef(null);

  const load = (pageOverride) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    const targetPage = pageOverride !== undefined ? pageOverride : currentPage;

    store.getMaterials({
      page: targetPage,
      limit: itemsPerPage,
      search: debouncedSearch,
      category: selectedCats.join(','),
      subCategory: selectedSubCats.join(','),
      status: selectedStatuses.join(','),
      supplier: selectedSuppliers.join(','),
      color: selectedColors.join(','),
      location: selectedLocations.join(','),
      name: selectedNames.join(','),
      type: selectedTypes.join(','),
      startDate,
      endDate,
      barcodeSeries,
      signal: controller.signal
    }).then(res => {
      if (res && res.success) {
        setMaterials(res.data || []);
        setTotalCount(res.totalCount || 0);
        setTotalPages(res.totalPages || 1);
        if (res.filterOptions) {
          setFilterOptions(res.filterOptions);
        }
      } else {
        // Fallback for non-paginated array
        const rawList = res || [];
        setMaterials(rawList);
        setTotalCount(rawList.length);
        setTotalPages(1);
      }
    }).catch(err => {
      if (err.name !== 'AbortError') {
        console.error('Error fetching materials:', err);
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    });
  };

  const isFirstRender = useRef(true);

  // When filters, itemsPerPage, or debouncedSearch change: reset page to 1 and fetch
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      load(1);
      return;
    }
    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      load(1);
    }
  }, [
    debouncedSearch,
    selectedCats,
    selectedSubCats,
    selectedStatuses,
    selectedSuppliers,
    selectedColors,
    selectedLocations,
    selectedNames,
    selectedTypes,
    startDate,
    endDate,
    barcodeSeries,
    itemsPerPage
  ]);

  // When currentPage changes independently (pagination click)
  useEffect(() => {
    if (!isFirstRender.current) {
      load(currentPage);
    }
  }, [currentPage]);

  // Reset subcategory when categories selection changes
  useEffect(() => {
    setSelectedSubCats([]);
  }, [selectedCats]);

  // Use values from backend filterOptions for the filters
  const uniqueColors = useMemo(() => filterOptions.colors, [filterOptions.colors]);
  const uniqueLocations = useMemo(() => filterOptions.locations, [filterOptions.locations]);
  const uniqueCategories = useMemo(() => {
    return filterOptions.categories.length === 0 ? CATEGORIES : filterOptions.categories;
  }, [filterOptions.categories]);
  const uniqueNames = useMemo(() => filterOptions.names, [filterOptions.names]);

  const availableSubCats = useMemo(() => {
    if (selectedCats.length === 0) return filterOptions.subCategories;
    // Filter the subCategories based on static mapping keys
    if (selectedCats.length === 1) {
      const cat = selectedCats[0];
      const staticSubCats = SUB_CATS[cat] || [];
      return filterOptions.subCategories.filter(sc => staticSubCats.includes(sc) || !Object.values(SUB_CATS).flat().includes(sc));
    } else {
      const allowedSub = selectedCats.map(cat => SUB_CATS[cat] || []).flat();
      return filterOptions.subCategories.filter(sc => allowedSub.includes(sc));
    }
  }, [filterOptions.subCategories, selectedCats]);

  // The materials array matches the filtered + paginated dataset returned from backend
  const filtered = useMemo(() => {
    if (!skipReAdd) return materials;
    return materials.filter(m => !String(m.code || '').startsWith('9'));
  }, [materials, skipReAdd]);

  const fetchAllFilteredForExport = async () => {
    const res = await store.getMaterials({
      search: debouncedSearch,
      category: selectedCats.join(','),
      subCategory: selectedSubCats.join(','),
      status: selectedStatuses.join(','),
      supplier: selectedSuppliers.join(','),
      color: selectedColors.join(','),
      location: selectedLocations.join(','),
      name: selectedNames.join(','),
      type: selectedTypes.join(','),
      startDate,
      endDate,
      barcodeSeries
    });
    if (res && res.data && Array.isArray(res.data)) {
      return res.data;
    }
    return Array.isArray(res) ? res : [];
  };

  const getItemWiseDataToExport = async () => {
    let rawData = await fetchAllFilteredForExport();
    if (skipReAdd) {
      rawData = rawData.filter(m => !String(m.code || '').startsWith('9'));
    }

    if (!rawData || rawData.length === 0) {
      return { groupedList: [], totalRolls: 0, totalWeight: 0, totalRawRecords: 0 };
    }

    const groupMap = new Map();

    rawData.forEach(item => {
      const matName = (item.name || 'Unspecified').trim();
      const shade = (item.color || item.shade || '—').trim();
      const category = (item.category || 'General').trim();
      const unit = (item.inventoryType === 'Dyeing Material' || item.category === 'Dyeing') ? 'KGS' : (item.unit || 'Kg');

      const key = `${matName.toUpperCase()}|||${shade.toUpperCase()}`;

      const rollsCount = parseInt(item.rolls, 10) || 1;
      const weightVal = parseFloat(item.weight) || 0;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          materialName: matName,
          shade: shade,
          category: category,
          unit: unit,
          totalRolls: rollsCount,
          totalWeight: weightVal,
          recordCount: 1
        });
      } else {
        const existing = groupMap.get(key);
        existing.totalRolls += rollsCount;
        existing.totalWeight += weightVal;
        existing.recordCount += 1;
      }
    });

    const groupedList = Array.from(groupMap.values()).sort((a, b) => {
      const nameComp = a.materialName.localeCompare(b.materialName);
      if (nameComp !== 0) return nameComp;
      return a.shade.localeCompare(b.shade);
    });

    const grandTotalRolls = groupedList.reduce((sum, g) => sum + g.totalRolls, 0);
    const grandTotalWeight = groupedList.reduce((sum, g) => sum + g.totalWeight, 0);

    return {
      groupedList,
      totalRolls: grandTotalRolls,
      totalWeight: grandTotalWeight,
      totalRawRecords: rawData.length
    };
  };

  const exportItemWiseExcel = async () => {
    try {
      const { groupedList, totalRolls, totalWeight } = await getItemWiseDataToExport();
      if (groupedList.length === 0) {
        alert('No data to export.');
        return;
      }

      const exportRows = groupedList.map((item, index) => ({
        "S.No": index + 1,
        "Material Name": item.materialName,
        "Shade / Color": item.shade,
        "Category": item.category,
        "Total Rolls": item.totalRolls,
        "Total Weight / Qty": Number(item.totalWeight.toFixed(2)),
        "Unit": item.unit
      }));

      exportRows.push({
        "S.No": "TOTAL",
        "Material Name": `Total Item Shades: ${groupedList.length}`,
        "Shade / Color": "",
        "Category": "",
        "Total Rolls": totalRolls,
        "Total Weight / Qty": Number(totalWeight.toFixed(2)),
        "Unit": ""
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);

      const colWidths = [
        { wch: 8 },
        { wch: 35 },
        { wch: 20 },
        { wch: 20 },
        { wch: 14 },
        { wch: 20 },
        { wch: 10 }
      ];
      ws['!cols'] = colWidths;

      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;

          if (R === 0) {
            ws[cellAddress].s = {
              fill: { fgColor: { rgb: "1A56DB" } },
              font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
              alignment: { horizontal: C >= 4 ? "right" : (C === 0 ? "center" : "left"), vertical: "center" },
              border: {
                top: { style: "thin", color: { rgb: "1D4ED8" } },
                bottom: { style: "medium", color: { rgb: "1E40AF" } }
              }
            };
          } else if (R === range.e.r) {
            ws[cellAddress].s = {
              fill: { fgColor: { rgb: "E0F2FE" } },
              font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "0F172A" } },
              alignment: { horizontal: C >= 4 ? "right" : (C === 0 ? "center" : "left"), vertical: "center" },
              border: {
                top: { style: "thin", color: { rgb: "0284C7" } },
                bottom: { style: "double", color: { rgb: "0369A1" } }
              }
            };
          } else {
            const isEven = R % 2 === 0;
            ws[cellAddress].s = {
              fill: { fgColor: { rgb: isEven ? "F8FAFC" : "FFFFFF" } },
              font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
              alignment: { horizontal: (C === 0 || C >= 4) ? (C === 0 ? "center" : "right") : "left", vertical: "center" },
              border: {
                bottom: { style: "thin", color: { rgb: "E2E8F0" } }
              }
            };
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Item-Wise Summary");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Material_Master_Item_Wise_Summary_${dateStr}.xlsx`);
    } catch (e) {
      console.error(e);
      alert(`Item-Wise Excel Export failed: ${e.message}`);
    }
  };

  const exportItemWisePdf = async () => {
    try {
      const { groupedList, totalRolls } = await getItemWiseDataToExport();
      if (groupedList.length === 0) {
        alert('No data to export.');
        return;
      }

      const jsPDF = (await import('jspdf')).jsPDF;
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
      });

      const PAGE_W = doc.internal.pageSize.getWidth();
      const PAGE_H = doc.internal.pageSize.getHeight();
      const M = 30;
      let y = 35;

      const setFont = (style, size) => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
      };

      const drawPageBorder = () => {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1.5);
        doc.rect(M - 10, 15, PAGE_W - 2 * (M - 10), PAGE_H - 30);
      };

      drawPageBorder();

      // Header Title & Metadata (Black & White)
      doc.setTextColor(0, 0, 0);
      setFont("bold", 16);
      doc.text("MATERIAL MASTER - ITEM WISE SUMMARY REPORT", M, y + 15);

      setFont("normal", 9);
      doc.text(`Total Varieties: ${groupedList.length} | Total Rolls: ${totalRolls} | Generated: ${new Date().toLocaleString()}`, M, y + 30);

      // Black Divider Line
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.5);
      doc.line(M, y + 38, PAGE_W - M, y + 38);

      y += 48;

      // Table Columns (Only S.No, Material Name, Shade / Color, Total Rolls)
      const headers = [
        { label: "S.No", w: 45, align: "center" },
        { label: "Material Name", w: 260, align: "left" },
        { label: "Shade / Color", w: 140, align: "left" },
        { label: "Total Rolls", w: 90, align: "right" }
      ];

      const totalTableWidth = headers.reduce((sum, h) => sum + h.w, 0);
      const scaleFactor = (PAGE_W - 2 * M) / totalTableWidth;
      headers.forEach(h => { h.w = h.w * scaleFactor; });

      const drawTableHeader = (currentY) => {
        doc.setFillColor(235, 235, 235);
        doc.rect(M, currentY, PAGE_W - 2 * M, 24, 'F');

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1.2);
        doc.rect(M, currentY, PAGE_W - 2 * M, 24);

        let dividerX = M;
        headers.forEach((h, hIdx) => {
          if (hIdx > 0) doc.line(dividerX, currentY, dividerX, currentY + 24);
          dividerX += h.w;
        });

        doc.setTextColor(0, 0, 0);
        setFont("bold", 9.5);

        let curX = M;
        headers.forEach(h => {
          let xOffset = 6;
          if (h.align === "right") xOffset = h.w - 6;
          else if (h.align === "center") xOffset = h.w / 2;
          doc.text(h.label, curX + xOffset, currentY + 15, { align: h.align });
          curX += h.w;
        });
      };

      drawTableHeader(y);
      y += 24;

      // Table Data Rows
      groupedList.forEach((item, idx) => {
        const rowVals = [
          String(idx + 1),
          item.materialName,
          item.shade,
          String(item.totalRolls)
        ];

        const cellLines = rowVals.map((val, colIdx) => {
          const colWidth = headers[colIdx].w - 12;
          return doc.splitTextToSize(String(val), colWidth);
        });

        const maxLines = Math.max(...cellLines.map(lines => lines.length));
        const rowHeight = 14 + (maxLines * 10);

        if (y + rowHeight > PAGE_H - 55) {
          doc.addPage();
          drawPageBorder();
          y = 35;
          drawTableHeader(y);
          y += 24;
        }

        doc.setFillColor(255, 255, 255);
        doc.rect(M, y, PAGE_W - 2 * M, rowHeight, 'F');

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.8);
        doc.rect(M, y, PAGE_W - 2 * M, rowHeight);

        let dividerX = M;
        headers.forEach((h, hIdx) => {
          if (hIdx > 0) doc.line(dividerX, y, dividerX, y + rowHeight);
          dividerX += h.w;
        });

        doc.setTextColor(0, 0, 0);
        setFont("normal", 9);

        let rowX = M;
        headers.forEach((h, colIdx) => {
          const lines = cellLines[colIdx];
          let startX = rowX + 6;
          if (h.align === "right") startX = rowX + h.w - 6;
          else if (h.align === "center") startX = rowX + h.w / 2;

          lines.forEach((line, lineIdx) => {
            const lineY = y + 12 + (lineIdx * 10);
            doc.text(line, startX, lineY, { align: h.align });
          });
          rowX += h.w;
        });

        y += rowHeight;
      });

      // Total Summary Row
      if (y + 26 > PAGE_H - 45) {
        doc.addPage();
        drawPageBorder();
        y = 35;
      }

      doc.setFillColor(240, 240, 240);
      doc.rect(M, y, PAGE_W - 2 * M, 24, 'F');

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.4);
      doc.rect(M, y, PAGE_W - 2 * M, 24);

      let totalDividerX = M;
      headers.forEach((h, hIdx) => {
        if (hIdx > 0) doc.line(totalDividerX, y, totalDividerX, y + 24);
        totalDividerX += h.w;
      });

      doc.setTextColor(0, 0, 0);
      setFont("bold", 9.5);

      let totalX = M;
      const totalVals = [
        "TOTAL",
        `Total Item-Shades: ${groupedList.length}`,
        "",
        String(totalRolls)
      ];

      headers.forEach((h, colIdx) => {
        const val = totalVals[colIdx];
        if (val) {
          let startX = totalX + 6;
          if (h.align === "right") startX = totalX + h.w - 6;
          else if (h.align === "center") startX = totalX + h.w / 2;
          doc.text(val, startX, y + 16, { align: h.align });
        }
        totalX += h.w;
      });

      doc.save(`Material_Master_Item_Wise_Summary_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Failed to generate Item-Wise PDF: ' + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this material?')) return;
    try {
      await store.deleteMaterial(id);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const exportToPdf = async () => {
    try {
      const dataToExport = await fetchAllFilteredForExport();
      if (dataToExport.length === 0) {
        alert('No data to export.');
        return;
      }

      const jsPDF = (await import('jspdf')).jsPDF;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4"
      });

      const PAGE_W = doc.internal.pageSize.getWidth();
      const PAGE_H = doc.internal.pageSize.getHeight();
      const M = 20; // margins
      let y = 35;

      const setFont = (style, size) => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
      };

      // Draw page border
      const drawPageBorder = () => {
        doc.setDrawColor(30, 86, 219); // Royal Blue border
        doc.setLineWidth(1);
        doc.rect(M - 5, 10, PAGE_W - 2 * (M - 5), PAGE_H - 20);
      };

      drawPageBorder();

      // --- Header Block (Premium Theme) ---
      doc.setTextColor(30, 86, 219); // Royal Blue
      setFont("bold", 14);
      doc.text("MATERIAL MASTER REPORT", M + 10, y + 15);

      doc.setTextColor(100, 100, 100);
      setFont("normal", 9);
      doc.text(`Records: ${dataToExport.length} | Generated: ${new Date().toLocaleString()}`, M + 10, y + 28);

      // Header underline divider
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(1);
      doc.line(M, y + 36, PAGE_W - M, y + 36);

      y += 48;

      // Table columns
      const headers = [
        { label: "Code", w: 70, align: "left" },
        { label: "Material Name", w: 150, align: "left" },
        { label: "Category", w: 90, align: "left" },
        { label: "Color", w: 70, align: "left" },
        { label: "Lot Number", w: 70, align: "left" },
        { label: "Supplier", w: 100, align: "left" },
        { label: "Qty / Unit", w: 60, align: "right" },
        { label: "Stock (Rolls)", w: 60, align: "right" },
        { label: "Location", w: 80, align: "center" },
        { label: "Status", w: 60, align: "center" }
      ];

      const totalTableWidth = headers.reduce((sum, h) => sum + h.w, 0);
      const scaleFactor = (PAGE_W - 2 * M) / totalTableWidth;
      headers.forEach(h => { h.w = h.w * scaleFactor; });

      // Draw table header row
      const drawTableHeader = (currentY) => {
        // Royal Blue header box
        doc.setFillColor(26, 86, 219);
        doc.rect(M, currentY, PAGE_W - 2 * M, 22, 'F');

        // Draw white vertical dividers for headers
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.7);
        let dividerX = M;
        headers.forEach((h, hIdx) => {
          if (hIdx > 0) {
            doc.line(dividerX, currentY, dividerX, currentY + 22);
          }
          dividerX += h.w;
        });

        doc.setTextColor(255, 255, 255);
        setFont("bold", 8);

        let curX = M;
        headers.forEach(h => {
          let xOffset = 5;
          if (h.align === "right") xOffset = h.w - 5;
          else if (h.align === "center") xOffset = h.w / 2;

          doc.text(h.label, curX + xOffset, currentY + 14, { align: h.align });
          curX += h.w;
        });
      };

      drawTableHeader(y);
      y += 22;

      // Draw data rows (Dynamic Wrap Layout)
      dataToExport.forEach((item, idx) => {
        const rowVals = [
          item.code || "—",
          item.name || "—",
          item.category || "—",
          item.color || "—",
          item.lotNo || "—",
          getSupplierName(item.supplier),
          `${item.weight} ${(item.inventoryType === 'Dyeing Material' || item.category === 'Dyeing') ? 'KGS' : (item.unit || 'Kg')}`,
          String(item.rolls || "0"),
          item.location || "—",
          item.status || "—"
        ];

        // Split text to fit each column's scaled width (with 10pt horizontal cell padding)
        const cellLines = rowVals.map((val, colIdx) => {
          const colWidth = headers[colIdx].w - 10;
          return doc.splitTextToSize(String(val), colWidth);
        });

        // Determine row height based on maximum line count in any cell of this row
        const maxLines = Math.max(...cellLines.map(lines => lines.length));
        const rowHeight = 12 + (maxLines * 10); // Base padding + lines height

        if (y + rowHeight > PAGE_H - 45) {
          doc.addPage();
          drawPageBorder();
          y = 30;
          drawTableHeader(y);
          y += 22;
        }

        // Zebra stripes
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(M, y, PAGE_W - 2 * M, rowHeight, 'F');
        }

        // Draw border around the row
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.6);
        doc.rect(M, y, PAGE_W - 2 * M, rowHeight);

        // Draw vertical dividers
        let dividerX = M;
        headers.forEach((h, hIdx) => {
          if (hIdx > 0) {
            doc.line(dividerX, y, dividerX, y + rowHeight);
          }
          dividerX += h.w;
        });

        doc.setTextColor(15, 23, 42);
        setFont("normal", 7.5);

        let rowX = M;
        headers.forEach((h, colIdx) => {
          const lines = cellLines[colIdx];
          let startX = rowX + 5;
          if (h.align === "right") startX = rowX + h.w - 5;
          else if (h.align === "center") startX = rowX + h.w / 2;

          lines.forEach((line, lineIdx) => {
            const lineY = y + 12 + (lineIdx * 10); // line spacing offset
            doc.text(line, startX, lineY, { align: h.align });
          });
          rowX += h.w;
        });

        y += rowHeight;
      });

      doc.save(`Material_Master_Export_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Failed to generate PDF: ' + e.message);
    }
  };

  const handleExport = async () => {
    try {
      const dataToExport = await fetchAllFilteredForExport();
      if (dataToExport.length === 0) {
        alert('No data to export.');
        return;
      }

      const headers = ['Code', 'Material Name', 'Category', 'Color', 'Lot Number', 'Weight (Kg)', 'Stock (Rolls)', 'Location', 'Status'];
      const rows = dataToExport.map(m => [
        m.code,
        m.name,
        m.category,
        m.color || '—',
        m.lotNo || '—',
        m.weight,
        m.rolls,
        m.location,
        m.status
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `material_master_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    }
  };

  const getSupplierName = (val) => {
    if (!val) return '—';
    const found = suppliers.find(s => String(s.id) === String(val) || s.name === val);
    if (found && found.name) return found.name;
    if (typeof val === 'string' && val.trim() && isNaN(val)) {
      return val.trim();
    }
    return val || '—';
  };

  return (
    <div className="materials-page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* ── Page Header & Quick Export Actions ── */}
      <div className="materials-header-card">
        <div className="materials-title-group">
          <button
            onClick={() => window.history.back()}
            className="materials-back-btn"
            title="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="materials-breadcrumb">
              <span>Home</span>
              <span className="sep">/</span>
              <span className="current">Material Master</span>
            </div>
            <h1 className="materials-page-title">Material Master & Fabric Registry</h1>
            <p className="materials-page-subtitle">
              Comprehensive registry of fabric materials, roll barcodes, color shades, and warehouse rack placement.
            </p>
          </div>
        </div>

        <div className="materials-action-buttons">
          <button
            className="mat-action-btn secondary"
            id="toggle-inventory-btn"
            onClick={() => navigate('/old-inventory')}
          >
            <Package size={14} />
            <span>View Old Inventory</span>
          </button>
          <button
            className="mat-action-btn emerald"
            id="export-materials-csv-btn"
            onClick={handleExport}
            title="Export detailed roll-by-roll records to CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            className="mat-action-btn blue"
            id="export-materials-pdf-btn"
            onClick={exportToPdf}
            title="Export detailed roll-by-roll records to PDF"
          >
            <Download size={14} />
            <span>Export PDF</span>
          </button>
          <button
            className="mat-action-btn indigo"
            id="export-itemwise-excel-btn"
            onClick={exportItemWiseExcel}
            title="Export Item-wise summary (Material Name, Shade, Total Rolls) to Excel"
          >
            <FileSpreadsheet size={14} />
            <span>Item-Wise Excel</span>
          </button>
          <button
            className="mat-action-btn purple"
            id="export-itemwise-pdf-btn"
            onClick={exportItemWisePdf}
            title="Export Item-wise summary (Material Name, Shade, Total Rolls) to PDF"
          >
            <FileText size={14} />
            <span>Item-Wise PDF</span>
          </button>
        </div>
      </div>

      {/* ── Advanced Filter Command Panel ── */}
      <div className="materials-filter-panel">
        {/* Quick Date Range Presets */}
        <div className="date-presets-strip">
          <span className="date-preset-label">
            📅 Date Preset:
          </span>
          <div className="date-preset-pill-group">
            {[
              { key: '7days', label: '⚡ Weekly (Last 7 Days)' },
              { key: '30days', label: '🗓️ Last 30 Days' },
              { key: 'thisMonth', label: '📆 This Month' },
              { key: 'all', label: '♾️ All Time' }
            ].map(preset => {
              const isActive = activeDatePreset === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyDatePreset(preset.key)}
                  className={`preset-pill-btn ${isActive ? 'active' : ''}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          {activeDatePreset === '7days' && (
            <span className="active-preset-badge">
              ⚡ Fast Weekly View Active
            </span>
          )}
        </div>

        {/* Dynamic MultiSelect & Filter Inputs Grid */}
        <div className="filter-inputs-grid">
          <div className="search-bar-wrap" style={{ gridColumn: 'span 2', minWidth: '280px' }}>
            <Search size={15} className="search-icon" />
            <input
              id="material-search"
              placeholder="Search by name, code, lot, location..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="search-field-input"
            />
            {searchInput && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => { setSearchInput(''); setDebouncedSearch(''); }}
                title="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          <MultiSelect
            label="Inventory Type"
            options={['Normal Inventory', 'FabricStock(Mtrs)', 'Dyeing Material']}
            selectedValues={selectedTypes}
            onChange={vals => { setSelectedTypes(vals); }}
            placeholder="All Inventory Types"
          />

          <MultiSelect
            label="Categories"
            options={uniqueCategories}
            selectedValues={selectedCats}
            onChange={vals => { setSelectedCats(vals); }}
            placeholder="All Categories"
          />

          <MultiSelect
            label="Sub Categories"
            options={availableSubCats}
            selectedValues={selectedSubCats}
            onChange={vals => { setSelectedSubCats(vals); }}
            placeholder="All Sub Categories"
          />

          <MultiSelect
            label="Status"
            options={['Active', 'Low Stock', 'Inactive', 'Issued']}
            selectedValues={selectedStatuses}
            onChange={vals => { setSelectedStatuses(vals); }}
            placeholder="All Status"
          />

          <MultiSelect
            label="Suppliers"
            options={suppliers.map(s => s.name)}
            selectedValues={selectedSuppliers}
            onChange={vals => { setSelectedSuppliers(vals); }}
            placeholder="All Suppliers"
          />

          <MultiSelect
            label="Colors"
            options={uniqueColors}
            selectedValues={selectedColors}
            onChange={vals => { setSelectedColors(vals); }}
            placeholder="All Colors"
          />

          <MultiSelect
            label="Locations"
            options={uniqueLocations}
            selectedValues={selectedLocations}
            onChange={vals => { setSelectedLocations(vals); }}
            placeholder="All Locations"
          />

          <MultiSelect
            label="Descriptions"
            options={uniqueNames}
            selectedValues={selectedNames}
            onChange={vals => { setSelectedNames(vals); }}
            placeholder="All Material Names"
          />

          <div className="date-input-wrap">
            <input
              type="date"
              className="date-picker-control"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setActiveDatePreset('custom'); }}
              title="Filter Start Date"
            />
          </div>

          <div className="date-input-wrap">
            <input
              type="date"
              className="date-picker-control"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setActiveDatePreset('custom'); }}
              title="Filter End Date"
            />
          </div>
        </div>

        {/* Filter Summary & Reset Footer */}
        <div className="filter-summary-row">
          <button
            type="button"
            className="filter-reset-btn"
            onClick={() => {
              setSearchInput('');
              setDebouncedSearch('');
              setSelectedCats([]);
              setSelectedSubCats([]);
              setSelectedStatuses([]);
              setSelectedSuppliers([]);
              setSelectedColors([]);
              setSelectedLocations([]);
              setSelectedNames([]);
              setSelectedTypes([]);
              setBarcodeSeries('All');
              applyDatePreset('7days');
            }}
          >
            ↺ Reset All Filters
          </button>
          <div className="items-count-pill">
            Found <strong>{totalCount.toLocaleString()}</strong> materials & rolls in registry
          </div>
        </div>
      </div>

      {/* ── Barcode Series & Segregation Segment Bar ── */}
      <div className="barcode-series-toolbar">
        <div className="series-pill-group">
          <span className="series-title">Barcode Series:</span>
          {[
            { key: 'All', label: 'All Barcodes' },
            { key: '9', label: 'Series 9 (Re-Added)' },
            { key: 'MAT', label: 'Series MAT (Regular)' },
            { key: 'DYE', label: 'Series DYE (Dyeing)' },
            { key: 'Plain', label: 'Plain Numeric Series' }
          ].map(tab => {
            const isActive = barcodeSeries === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setBarcodeSeries(tab.key)}
                className={`series-tab-btn ${isActive ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Skip Re-add Lots Filter Toggle */}
        <label className="skip-readd-checkbox-card">
          <input
            type="checkbox"
            checked={skipReAdd}
            onChange={e => setSkipReAdd(e.target.checked)}
            className="skip-readd-input"
          />
          <span>Skip Re-Add Lots</span>
        </label>
      </div>

      {/* ── High-Tech Materials Master Table ── */}
      <div className="materials-table-card">
        <div className="materials-table-wrapper">
          <table className="materials-master-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Material Name</th>
                <th>Category</th>
                <th>Color</th>
                <th>Lot Number</th>
                <th>Supplier</th>
                <th>Weight / Meters</th>
                <th>Stock (Rolls)</th>
                <th>Location</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11}>
                    <div className="table-loading-container">
                      <div className="table-loading-spinner" />
                      <div className="loading-text">Loading warehouse materials registry...</div>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-materials-state">
                      <div className="empty-icon-box"><Package size={32} /></div>
                      <h3>No Materials Found</h3>
                      <p>Try clearing your active filters or searching for another barcode / lot number.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(m => {
                const statusStr = String(m.status || '').toLowerCase();
                let statusBadgeClass = 'badge-active';
                let statusLabel = m.status || 'Active';

                if (statusStr.includes('low')) {
                  statusBadgeClass = 'badge-low';
                  statusLabel = 'Low Stock';
                } else if (statusStr.includes('issue')) {
                  statusBadgeClass = 'badge-issued';
                  statusLabel = 'Issued';
                } else if (statusStr.includes('inact')) {
                  statusBadgeClass = 'badge-inactive';
                  statusLabel = 'Inactive';
                }

                return (
                  <tr key={m.id} className="material-data-row">
                    {/* Code */}
                    <td>
                      <span className="material-code-pill">
                        {m.code}
                      </span>
                    </td>

                    {/* Material Name */}
                    <td>
                      <div className="material-name-cell">
                        <span className="material-title-text">{m.name}</span>
                        {m.inventoryType && m.inventoryType !== 'Normal Inventory' && (
                          <span className="material-sub-type">{m.inventoryType}</span>
                        )}
                      </div>
                    </td>

                    {/* Category */}
                    <td>
                      <span className="category-chip">
                        {m.category || 'General'}
                      </span>
                    </td>

                    {/* Color */}
                    <td>
                      <span className="color-cell-text">{m.color || '—'}</span>
                    </td>

                    {/* Lot Number */}
                    <td>
                      <span className="lot-number-pill">
                        {m.lotNo || 'OLD STOCK'}
                      </span>
                    </td>

                    {/* Supplier */}
                    <td>
                      <span className="supplier-text">{getSupplierName(m.supplier)}</span>
                    </td>

                    {/* Weight / Meters */}
                    <td>
                      <span className="weight-badge">
                        {m.weight} {(m.inventoryType === 'Dyeing Material' || m.category === 'Dyeing') ? 'KGS' : (m.unit || 'Kg')}
                      </span>
                    </td>

                    {/* Stock Rolls */}
                    <td>
                      <span className={`rolls-count-pill ${parseInt(m.rolls) > 0 ? 'in-stock' : 'zero-stock'}`}>
                        {m.rolls} {parseInt(m.rolls) === 1 ? 'Roll' : 'Rolls'}
                      </span>
                    </td>

                    {/* Location */}
                    <td>
                      <span className="location-chip">
                        📍 {m.location || 'Unassigned'}
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`status-pill ${statusBadgeClass}`}>
                        <span className="status-dot" />
                        {statusLabel}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="actions-btn-group">
                        <button
                          className="row-action-btn qr-btn"
                          title="Generate QR / Barcode"
                          id={`qr-btn-${m.id}`}
                          onClick={() => setShowQR(m)}
                        >
                          <QrCode size={13} />
                        </button>
                        <button
                          className="row-action-btn edit-btn"
                          title="Edit Material"
                          id={`edit-mat-${m.id}`}
                          onClick={() => { setEditMat(m); setShowForm(true); }}
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          className="row-action-btn delete-btn"
                          title="Delete Material"
                          id={`del-mat-${m.id}`}
                          onClick={() => handleDelete(m.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination Controls ── */}
      {totalPages > 1 && (
        <div className="materials-pagination-bar">
          <div className="pagination-info-text">
            Showing <strong>{((currentPage - 1) * itemsPerPage) + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, totalCount)}</strong> of <strong>{totalCount.toLocaleString()}</strong> materials
          </div>
          <div className="pagination-controls-row">
            <button
              className="pagination-nav-btn"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
              if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 2 && pageNum <= currentPage + 2)) {
                return (
                  <button
                    key={pageNum}
                    className={`pagination-num-btn ${currentPage === pageNum ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              } else if (pageNum === currentPage - 3 || pageNum === currentPage + 3) {
                return <span key={pageNum} className="pagination-ellipsis">...</span>;
              }
              return null;
            })}

            <button
              className="pagination-nav-btn"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
          <div className="pagination-page-size-wrap">
            <span>Show per page:</span>
            <select
              className="page-size-select"
              value={itemsPerPage}
              onChange={e => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

      {showForm && (
        <MaterialForm
          material={editMat}
          suppliers={suppliers}
          categories={uniqueCategories}
          subcategories={availableSubCats}
          onSave={() => { load(); setShowForm(false); }}
          onClose={() => setShowForm(false)}
        />
      )}
      {showQR && <BarcodeModal material={showQR} onClose={() => setShowQR(null)} />}

      {/* ── LUXURY STYLING INJECTION ── */}
      <style>{`
        /* 1. Header Card */
        .materials-header-card {
          background: var(--surface, #FFFFFF);
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 12px;
          padding: 18px 22px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
        }
        .dark .materials-header-card {
          background: #1E293B;
          border-color: #334155;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        }

        .materials-title-group {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .materials-back-btn {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          border: 1px solid var(--border, #E2E8F0);
          background: var(--bg, #F8FAFC);
          color: var(--text-primary, #0F172A);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 2px;
        }
        .dark .materials-back-btn {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }
        .materials-back-btn:hover {
          background: #2563EB;
          color: #FFFFFF;
          border-color: #2563EB;
        }

        .materials-breadcrumb {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text-secondary, #64748B);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .materials-breadcrumb .sep { opacity: 0.4; }
        .materials-breadcrumb .current { color: #2563EB; }
        .dark .materials-breadcrumb .current { color: #60A5FA; }

        .materials-page-title {
          margin: 0;
          font-size: 22px;
          font-weight: 850;
          color: var(--text-primary, #0F172A);
          letter-spacing: -0.5px;
        }
        .dark .materials-page-title {
          color: #F8FAFC;
        }

        .materials-page-subtitle {
          margin: 4px 0 0 0;
          font-size: 13px;
          color: var(--text-secondary, #64748B);
        }
        .dark .materials-page-subtitle {
          color: #94A3B8;
        }

        .materials-action-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .mat-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 750;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }
        .mat-action-btn.secondary {
          background: var(--bg, #F8FAFC);
          border-color: var(--border, #E2E8F0);
          color: var(--text-primary, #0F172A);
        }
        .dark .mat-action-btn.secondary {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }
        .mat-action-btn.secondary:hover {
          background: #E2E8F0;
        }
        .dark .mat-action-btn.secondary:hover {
          background: #334155;
        }

        .mat-action-btn.emerald {
          background: #10B981;
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
        }
        .mat-action-btn.emerald:hover {
          background: #059669;
          transform: translateY(-1px);
        }

        .mat-action-btn.blue {
          background: linear-gradient(135deg, #1E40AF 0%, #2563EB 100%);
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
        }
        .mat-action-btn.blue:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
        }

        .mat-action-btn.indigo {
          background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%);
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
        }
        .mat-action-btn.indigo:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        }

        .mat-action-btn.purple {
          background: linear-gradient(135deg, #7C3AED 0%, #9333EA 100%);
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25);
        }
        .mat-action-btn.purple:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
        }

        /* 2. Filter Command Panel */
        .materials-filter-panel {
          background: var(--surface, #FFFFFF);
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 12px;
          padding: 16px 20px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .dark .materials-filter-panel {
          background: #1E293B;
          border-color: #334155;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        }

        .date-presets-strip {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border, #E2E8F0);
        }
        .dark .date-presets-strip {
          border-bottom-color: #334155;
        }
        .date-preset-label {
          font-size: 11px;
          font-weight: 850;
          color: var(--text-secondary, #64748B);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .date-preset-pill-group {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .preset-pill-btn {
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 750;
          border: 1px solid var(--border, #CBD5E1);
          background: transparent;
          color: var(--text-secondary, #64748B);
          cursor: pointer;
          transition: all 0.15s;
        }
        .dark .preset-pill-btn {
          border-color: #334155;
          color: #94A3B8;
        }
        .preset-pill-btn.active {
          background: #2563EB !important;
          color: #FFFFFF !important;
          border-color: #1D4ED8 !important;
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
        }
        .active-preset-badge {
          font-size: 11px;
          font-weight: 750;
          color: #2563EB;
          background: rgba(37, 99, 235, 0.1);
          padding: 3px 8px;
          border-radius: 4px;
          margin-left: auto;
        }
        .dark .active-preset-badge {
          color: #93C5FD;
          background: rgba(37, 99, 235, 0.2);
        }

        .filter-inputs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }

        .search-bar-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-bar-wrap .search-icon {
          position: absolute;
          left: 12px;
          color: #94A3B8;
          pointer-events: none;
        }
        .search-field-input {
          width: 100%;
          padding: 8px 32px 8px 34px;
          border-radius: 8px;
          border: 1.5px solid var(--border, #E2E8F0);
          background: var(--bg, #F8FAFC);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary, #0F172A);
          outline: none;
          transition: all 0.2s;
        }
        .dark .search-field-input {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }
        .search-field-input:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        .search-clear-btn {
          position: absolute;
          right: 10px;
          background: transparent;
          border: none;
          color: #94A3B8;
          cursor: pointer;
          font-size: 11px;
          padding: 2px 4px;
        }

        .date-input-wrap {
          min-width: 140px;
        }
        .date-picker-control {
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1.5px solid var(--border, #E2E8F0);
          background: var(--bg, #F8FAFC);
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-primary, #0F172A);
          outline: none;
          box-sizing: border-box;
        }
        .dark .date-picker-control {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }

        .filter-summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 10px;
          border-top: 1px solid var(--border, #E2E8F0);
        }
        .dark .filter-summary-row {
          border-top-color: #334155;
        }
        .filter-reset-btn {
          background: transparent;
          border: none;
          color: #2563EB;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }
        .dark .filter-reset-btn {
          color: #60A5FA;
        }
        .filter-reset-btn:hover {
          text-decoration: underline;
        }
        .items-count-pill {
          font-size: 12.5px;
          color: var(--text-secondary, #64748B);
        }
        .dark .items-count-pill {
          color: #94A3B8;
        }

        /* 3. Barcode Series Toolbar */
        .barcode-series-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .series-pill-group {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          background: var(--surface, #FFFFFF);
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 10px;
          padding: 6px 10px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
        }
        .dark .series-pill-group {
          background: #1E293B;
          border-color: #334155;
        }
        .series-title {
          font-size: 11px;
          font-weight: 850;
          color: var(--text-secondary, #64748B);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-right: 4px;
        }
        .series-tab-btn {
          padding: 5px 11px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 750;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary, #64748B);
          cursor: pointer;
          transition: all 0.15s;
        }
        .dark .series-tab-btn {
          color: #94A3B8;
        }
        .series-tab-btn.active {
          background: #2563EB !important;
          color: #FFFFFF !important;
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
        }

        .skip-readd-checkbox-card {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          background: var(--surface, #FFFFFF);
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 9px;
          font-size: 12px;
          font-weight: 750;
          color: var(--text-primary, #0F172A);
          cursor: pointer;
          user-select: none;
        }
        .dark .skip-readd-checkbox-card {
          background: #1E293B;
          border-color: #334155;
          color: #F8FAFC;
        }
        .skip-readd-input {
          accent-color: #2563EB;
          width: 15px;
          height: 15px;
          cursor: pointer;
        }

        /* 4. Luxury Table Card */
        .materials-table-card {
          border-radius: 12px;
          border: 1px solid var(--border, #E2E8F0);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
          background: var(--surface, #FFFFFF);
          overflow: hidden;
        }
        .dark .materials-table-card {
          background: #1E293B;
          border-color: #334155;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }

        .materials-table-wrapper {
          overflow-x: auto;
        }

        .materials-master-table {
          width: 100% !important;
          border-collapse: collapse !important;
          font-size: 12.5px !important;
          text-align: left !important;
        }

        .materials-master-table thead {
          background: #1E3A8A !important;
        }
        .materials-master-table thead tr {
          background: #1E3A8A !important;
        }
        .materials-master-table th {
          padding: 14px 16px !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          font-size: 11px !important;
          letter-spacing: 0.6px !important;
          color: #FFFFFF !important;
          background-color: #1E3A8A !important;
          background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%) !important;
          border: none !important;
          border-bottom: 2px solid #1D4ED8 !important;
          white-space: nowrap !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        .dark .materials-master-table thead,
        .dark .materials-master-table thead tr,
        .dark .materials-master-table th {
          background-color: #0F172A !important;
          background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%) !important;
          border-bottom-color: #2563EB !important;
          color: #FFFFFF !important;
        }

        .materials-master-table td {
          padding: 12px 16px !important;
          border-bottom: 1px solid var(--border, #F1F5F9) !important;
          border-right: 1px solid var(--border, #F1F5F9) !important;
          color: var(--text-primary, #0F172A) !important;
          vertical-align: middle !important;
        }
        .dark .materials-master-table td {
          border-bottom-color: #334155;
          border-right-color: #334155;
          color: #F8FAFC;
        }
        .materials-master-table td:last-child,
        .materials-master-table th:last-child {
          border-right: none;
        }

        .material-data-row {
          transition: background 0.15s ease;
        }
        .material-data-row:hover {
          background: rgba(37, 99, 235, 0.05) !important;
        }
        .dark .material-data-row:hover {
          background: rgba(37, 99, 235, 0.12) !important;
        }

        /* Alternating zebra stripes */
        .materials-master-table tbody tr:nth-child(even) {
          background: rgba(248, 250, 252, 0.5);
        }
        .dark .materials-master-table tbody tr:nth-child(even) {
          background: rgba(15, 23, 42, 0.4);
        }

        /* Specific Cell Elements */
        .material-code-pill {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 800;
          font-size: 12px;
          color: #1E40AF;
          background: rgba(37, 99, 235, 0.1);
          padding: 3px 8px;
          border-radius: 6px;
          display: inline-block;
        }
        .dark .material-code-pill {
          color: #93C5FD;
          background: rgba(37, 99, 235, 0.2);
        }

        .material-name-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .material-title-text {
          font-weight: 750;
          color: var(--text-primary, #0F172A);
        }
        .dark .material-title-text {
          color: #F8FAFC;
        }
        .material-sub-type {
          font-size: 10px;
          color: #64748B;
        }
        .dark .material-sub-type {
          color: #94A3B8;
        }

        .category-chip {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 6px;
          background: #E0E7FF;
          color: #3730A3;
        }
        .dark .category-chip {
          background: #312E81;
          color: #C7D2FE;
        }

        .color-cell-text {
          font-weight: 600;
          color: var(--text-primary);
        }

        .lot-number-pill {
          font-weight: 750;
          font-size: 11.5px;
          color: var(--text-primary);
        }

        .supplier-text {
          font-size: 11.5px;
          color: var(--text-secondary, #64748B);
        }
        .dark .supplier-text {
          color: #94A3B8;
        }

        .weight-badge {
          font-weight: 800;
          font-size: 11.5px;
          color: #059669;
          background: rgba(16, 185, 129, 0.1);
          padding: 2px 8px;
          border-radius: 6px;
          display: inline-block;
        }
        .dark .weight-badge {
          color: #6EE7B7;
          background: rgba(16, 185, 129, 0.2);
        }

        .rolls-count-pill {
          font-weight: 800;
          font-size: 11.5px;
          padding: 2px 8px;
          border-radius: 6px;
          display: inline-block;
        }
        .rolls-count-pill.in-stock {
          background: rgba(37, 99, 235, 0.1);
          color: #1D4ED8;
        }
        .dark .rolls-count-pill.in-stock {
          background: rgba(37, 99, 235, 0.2);
          color: #93C5FD;
        }
        .rolls-count-pill.zero-stock {
          background: rgba(148, 163, 184, 0.15);
          color: #64748B;
        }
        .dark .rolls-count-pill.zero-stock {
          background: rgba(51, 65, 85, 0.5);
          color: #94A3B8;
        }

        .location-chip {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 6px;
          background: var(--bg, #F8FAFC);
          border: 1px solid var(--border, #CBD5E1);
          color: var(--text-primary);
        }
        .dark .location-chip {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 20px;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .status-pill.badge-active {
          background: #DCFCE7;
          color: #15803D;
        }
        .dark .status-pill.badge-active {
          background: rgba(16, 185, 129, 0.2);
          color: #6EE7B7;
        }
        .status-pill.badge-low {
          background: #FEF3C7;
          color: #B45309;
        }
        .dark .status-pill.badge-low {
          background: rgba(245, 158, 11, 0.2);
          color: #FCD34D;
        }
        .status-pill.badge-issued {
          background: #F1F5F9;
          color: #475569;
        }
        .dark .status-pill.badge-issued {
          background: rgba(51, 65, 85, 0.5);
          color: #94A3B8;
        }
        .status-pill.badge-inactive {
          background: #FEE2E2;
          color: #B91C1C;
        }
        .dark .status-pill.badge-inactive {
          background: rgba(239, 68, 68, 0.2);
          color: #FCA5A5;
        }

        .actions-btn-group {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .row-action-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid var(--border, #E2E8F0);
          background: var(--bg, #F8FAFC);
          color: var(--text-secondary, #64748B);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .dark .row-action-btn {
          background: #0F172A;
          border-color: #334155;
          color: #94A3B8;
        }
        .row-action-btn.qr-btn:hover {
          background: #2563EB;
          color: #FFFFFF;
          border-color: #2563EB;
        }
        .row-action-btn.edit-btn:hover {
          background: #10B981;
          color: #FFFFFF;
          border-color: #10B981;
        }
        .row-action-btn.delete-btn:hover {
          background: #EF4444;
          color: #FFFFFF;
          border-color: #EF4444;
        }

        /* 5. Pagination Bar */
        .materials-pagination-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          padding: 12px 18px;
          background: var(--surface, #FFFFFF);
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        }
        .dark .materials-pagination-bar {
          background: #1E293B;
          border-color: #334155;
        }
        .pagination-info-text {
          font-size: 12.5px;
          color: var(--text-secondary, #64748B);
        }
        .dark .pagination-info-text {
          color: #94A3B8;
        }

        .pagination-controls-row {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .pagination-nav-btn {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 750;
          background: var(--bg, #F8FAFC);
          border: 1px solid var(--border, #E2E8F0);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .dark .pagination-nav-btn {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }
        .pagination-nav-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .pagination-nav-btn:not(:disabled):hover {
          background: #2563EB;
          color: #FFFFFF;
          border-color: #2563EB;
        }

        .pagination-num-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 800;
          background: transparent;
          border: 1px solid var(--border, #E2E8F0);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dark .pagination-num-btn {
          border-color: #334155;
          color: #F8FAFC;
        }
        .pagination-num-btn.active {
          background: #2563EB !important;
          color: #FFFFFF !important;
          border-color: #1D4ED8 !important;
        }
        .pagination-ellipsis {
          padding: 0 4px;
          color: var(--text-secondary);
        }

        .pagination-page-size-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: var(--text-secondary);
        }
        .page-size-select {
          padding: 5px 8px;
          border-radius: 6px;
          border: 1px solid var(--border, #CBD5E1);
          background: var(--bg, #F8FAFC);
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 700;
          outline: none;
        }
        .dark .page-size-select {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }

        .table-loading-container,
        .empty-materials-state {
          text-align: center;
          padding: 48px 0;
          color: var(--text-secondary, #64748B);
        }
        .table-loading-spinner {
          display: inline-block;
          width: 32px;
          height: 32px;
          border: 3px solid rgba(37, 99, 235, 0.2);
          border-top-color: #2563EB;
          border-radius: 50%;
          animation: spinLoading 0.8s linear infinite;
          margin-bottom: 12px;
        }
        .empty-icon-box {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: rgba(37, 99, 235, 0.1);
          color: #2563EB;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px auto;
        }

        @keyframes spinLoading {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

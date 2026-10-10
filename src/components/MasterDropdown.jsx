import React, { useState, useEffect, useRef } from 'react';
import { store } from '../store.js';
import { ChevronDown, Plus, Search, Check, AlertCircle, Sparkles, X } from 'lucide-react';

export default function MasterDropdown({
  type = 'fabric',
  value = '',
  onChange,
  placeholder = 'Select or search...',
  required = false,
  disabled = false,
  allowQuickAdd = true,
  className = '',
  style = {}
}) {
  const [options, setOptions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickAddModal, setQuickAddModal] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddCode, setQuickAddCode] = useState('');
  const [quickAddError, setQuickAddError] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Load options on mount & type change
  useEffect(() => {
    let isMounted = true;
    const loadItems = async () => {
      setLoading(true);
      try {
        const data = await store.getMasterItems(type, '', 'Active');
        if (isMounted) {
          setOptions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.warn(`Error loading master options for ${type}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadItems();
    return () => { isMounted = false; };
  }, [type]);

  // Close dropdown when clicked outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options case-insensitively
  const filteredOptions = options.filter(opt => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (opt.name && opt.name.toLowerCase().includes(q)) ||
      (opt.code && opt.code.toLowerCase().includes(q))
    );
  });

  // Check if current search string exactly matches any existing option (case-insensitive)
  const isExactDuplicate = (inputStr) => {
    if (!inputStr || !inputStr.trim()) return false;
    const cleanNorm = inputStr.trim().replace(/\s+/g, ' ').toUpperCase();
    return options.some(o => (o.normalizedName || o.name.trim().toUpperCase()) === cleanNorm);
  };

  const handleSelect = (opt) => {
    onChange && onChange(opt.name);
    setIsOpen(false);
    setSearch('');
  };

  const handleOpenDropdown = () => {
    if (disabled) return;
    setIsOpen(prev => !prev);
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 50);
  };

  const handleQuickAddSubmit = async (e) => {
    e?.preventDefault();
    if (!quickAddName.trim()) {
      setQuickAddError('Please enter a valid item name.');
      return;
    }

    const cleanName = quickAddName.trim().replace(/\s+/g, ' ');

    if (isExactDuplicate(cleanName)) {
      setQuickAddError(`"${cleanName}" already exists! Duplicates are not allowed (case-insensitive check).`);
      return;
    }

    setQuickAddSaving(true);
    setQuickAddError('');

    try {
      const res = await store.addMasterItem({
        type,
        name: cleanName,
        code: quickAddCode.trim() || undefined,
        status: 'Active'
      });

      if (res && res.data) {
        setOptions(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
        onChange && onChange(res.data.name);
        setQuickAddModal(false);
        setQuickAddName('');
        setQuickAddCode('');
        setIsOpen(false);
      } else {
        throw new Error(res?.message || 'Failed to add item');
      }
    } catch (err) {
      setQuickAddError(err.message || 'Error saving new master item');
    } finally {
      setQuickAddSaving(false);
    }
  };

  const getTypeTitle = () => {
    switch (type) {
      case 'fabric': return 'Fabric Name';
      case 'shade': return 'Shade / Color';
      case 'party': return 'Party / CMF Name';
      case 'person': return 'Person';
      case 'category': return 'Group / Category';
      case 'location': return 'Location';
      default: return 'Item';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`master-dropdown-wrapper ${className}`}
      style={{ position: 'relative', width: '100%', ...style }}
    >
      {/* Dropdown Input Trigger */}
      <div
        onClick={handleOpenDropdown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '9px 12px',
          background: disabled ? 'var(--bg-input-disabled, rgba(0,0,0,0.05))' : 'var(--bg-input, #FFFFFF)',
          border: isOpen ? '1.5px solid #2563eb' : '1px solid var(--border, #CBD5E1)',
          borderRadius: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'none',
          transition: 'all 0.2s ease',
          minHeight: '40px',
          opacity: disabled ? 0.7 : 1
        }}
      >
        <span
          style={{
            flex: 1,
            color: value ? 'var(--text-primary, #0F172A)' : 'var(--text-muted, #94A3B8)',
            fontSize: '13.5px',
            fontWeight: value ? '600' : '400',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {value || placeholder}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {value && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange && onChange('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #94A3B8)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            style={{
              color: 'var(--text-muted, #64748B)',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease'
            }}
          />
        </div>
      </div>

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--surface, #FFFFFF)',
            border: '1px solid var(--border, #E2E8F0)',
            borderRadius: '10px',
            boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0,0,0,0.05)',
            maxHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {/* Search Header */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--border, #E2E8F0)',
              background: 'var(--bg-subtle, #F8FAFC)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Search size={15} style={{ color: '#64748B' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${getTypeTitle()}...`}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '13px',
                fontWeight: '500',
                color: 'var(--text-primary, #0F172A)'
              }}
            />
            {search && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSearch(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={13} style={{ color: '#94A3B8' }} />
              </button>
            )}
          </div>

          {/* Options List */}
          <div
            style={{
              overflowY: 'auto',
              maxHeight: '200px',
              padding: '4px'
            }}
          >
            {loading ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                Loading options...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '6px' }}>
                  No match found for "{search}"
                </div>
                {allowQuickAdd && search.trim() && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickAddName(search.trim());
                      setQuickAddModal(true);
                      setQuickAddError('');
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={13} /> Add "{search.trim()}" to Master
                  </button>
                )}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value && value.trim().toLowerCase() === opt.name.trim().toLowerCase();
                return (
                  <div
                    key={opt.id || opt.name}
                    onClick={() => handleSelect(opt)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: isSelected ? '700' : '500',
                      background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      color: isSelected ? '#2563eb' : 'var(--text-primary, #1E293B)',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover, #F1F5F9)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{opt.name}</span>
                      {opt.code && (
                        <span
                          style={{
                            fontSize: '11px',
                            background: 'rgba(0,0,0,0.06)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            color: '#64748B',
                            fontWeight: '600'
                          }}
                        >
                          {opt.code}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={15} style={{ color: '#2563eb' }} />}
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Quick Add Footer */}
          {allowQuickAdd && (
            <div
              style={{
                padding: '8px 10px',
                borderTop: '1px solid var(--border, #E2E8F0)',
                background: 'var(--bg-subtle, #F8FAFC)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>
                {options.length} standardized {type} items
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickAddName(search.trim());
                  setQuickAddModal(true);
                  setQuickAddError('');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'transparent',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}
              >
                <Plus size={13} /> + Create New {getTypeTitle()}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick Add Modal */}
      {quickAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuickAddModal(false);
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              background: 'var(--surface, #FFFFFF)',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              animation: 'scaleIn 0.2s ease-out'
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Plus size={18} color="white" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                    Create {getTypeTitle()}
                  </h3>
                  <p style={{ margin: 0, fontSize: '11px', opacity: 0.8 }}>
                    Standardized Master Registry
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickAddModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'white'
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleQuickAddSubmit} style={{ padding: '20px' }}>
              {/* Duplicate Prevention Notice */}
              <div
                style={{
                  background: 'rgba(37, 99, 235, 0.06)',
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '12px',
                  color: 'var(--text-secondary, #475569)'
                }}
              >
                <Sparkles size={16} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Strict Duplicate Protection:</strong> Items are standardized case-insensitively. E.g. "Lycra Sinker" and "LYCRA SINKER" are treated as the same item.
                </span>
              </div>

              {quickAddError && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    color: '#b91c1c',
                    fontSize: '12.5px',
                    fontWeight: '600'
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{quickAddError}</span>
                </div>
              )}

              {/* Real-time duplicate warning as user types */}
              {quickAddName.trim() && isExactDuplicate(quickAddName) && !quickAddError && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid #f59e0b',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#b45309',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}
                >
                  <AlertCircle size={15} />
                  <span>⚠️ "{quickAddName.trim()}" already exists in {getTypeTitle()}! Duplicate creation is blocked.</span>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', marginBottom: '6px' }}>
                  {getTypeTitle()} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={quickAddName}
                  onChange={(e) => {
                    setQuickAddName(e.target.value);
                    if (quickAddError) setQuickAddError('');
                  }}
                  placeholder={`e.g. ${type === 'fabric' ? 'LYCRA SINKER' : type === 'shade' ? 'NAVY BLUE' : 'ABC TEXTILES'}`}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border, #CBD5E1)',
                    fontSize: '14px',
                    fontWeight: '600',
                    outline: 'none',
                    background: 'var(--bg-input, #FFFFFF)',
                    color: 'var(--text-primary, #0F172A)'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', marginBottom: '6px' }}>
                  Short Code / Alias (Optional)
                </label>
                <input
                  type="text"
                  value={quickAddCode}
                  onChange={(e) => setQuickAddCode(e.target.value)}
                  placeholder="e.g. LS-01"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #CBD5E1)',
                    fontSize: '13px',
                    outline: 'none',
                    background: 'var(--bg-input, #FFFFFF)',
                    color: 'var(--text-primary, #0F172A)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setQuickAddModal(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #CBD5E1)',
                    background: 'transparent',
                    color: 'var(--text-primary, #0F172A)',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickAddSaving || !quickAddName.trim() || isExactDuplicate(quickAddName)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: (quickAddSaving || !quickAddName.trim() || isExactDuplicate(quickAddName))
                      ? '#94A3B8'
                      : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: (quickAddSaving || !quickAddName.trim() || isExactDuplicate(quickAddName)) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {quickAddSaving ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import FabricReceiving from './FabricReceiving.jsx';
import '../Design/FabricIssued.css';

import { store, BASE_URL } from '../store.js';

// Load jsPDF lazily to avoid bundle-time resolution issues
async function loadJsPDF() {
  const mod = await import('jspdf');
  return mod.jsPDF || mod.default;
}

// ── Image helpers (used for PDF garment image) ───────────────────────────────
function extractDriveFileId(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/file\/d\/([^/]+)/) || u.search.match(/[?&]id=([^&]+)/);
    return m ? m[1] : '';
  } catch { return ''; }
}
function driveUcUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
async function loadImageAsBase64ForPdf(url, opts = {}) {
  return new Promise((resolve) => {
    try {
      const fileId = extractDriveFileId(url);
      const direct = fileId ? driveUcUrl(fileId) : (url || '').toString().trim();
      if (!direct) return resolve('');
      const clean = direct.replace(/^https?:\/\//, '');
      const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(clean)}`;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const maxW = opts.maxWidth || 400;
          const maxH = opts.maxHeight || 400;
          let { width, height } = img;
          if (width > maxW || height > maxH) {
            const r = Math.min(maxW / width, maxH / height);
            width = Math.max(1, Math.floor(width * r));
            height = Math.max(1, Math.floor(height * r));
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) return resolve('');
            const fr = new FileReader();
            fr.onloadend = () => resolve(fr.result || '');
            fr.readAsDataURL(blob);
          }, 'image/jpeg', 0.7);
        } catch { resolve(''); }
      };
      img.onerror = () => resolve('');
      img.src = proxied;
    } catch { resolve(''); }
  });
}


const FabricIssued = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [fabricRollData, setFabricRollData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchLot, setSearchLot] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [issueQuantity, setIssueQuantity] = useState({});
  const [issueWeight, setIssueWeight] = useState({});
  const [issueHistory, setIssueHistory] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedRoll, setScannedRoll] = useState(null);
  const [selectedShades, setSelectedShades] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannedBarcodes, setScannedBarcodes] = useState({});
  const [showReceiving, setShowReceiving] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Pagination states for history
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalRows, setHistoryTotalRows] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  // Global duplicate prevention states
  const [globalIssuedBarcodes, setGlobalIssuedBarcodes] = useState(new Set());
  const [isLoadingBarcodes, setIsLoadingBarcodes] = useState(false);
  const [duplicateCheckCache, setDuplicateCheckCache] = useState({});

  // Barcode search states
  const [searchBarcodeInput, setSearchBarcodeInput] = useState('');
  const [searchedRoll, setSearchedRoll] = useState(null);
  const [isSearchingRoll, setIsSearchingRoll] = useState(false);
  const [searchRollError, setSearchRollError] = useState(null);
  const [mtrWeightModal, setMtrWeightModal] = useState(null); // { barcodeId, matchingRoll, ... }
  const [scannedBarcodeWeights, setScannedBarcodeWeights] = useState({});
  const [fabricApprovals, setFabricApprovals] = useState({});
  const [defaultApproverName, setDefaultApproverName] = useState('');

  // Matching flow states (global — checked once per lot search)
  const [matchingModal, setMatchingModal] = useState(null); // { step: 'ask_matching' | 'ask_passed' | 'ask_approver' }
  const [lotScanningAllowed, setLotScanningAllowed] = useState(null); // null=not checked, true=allowed, false=blocked
  const [lotMatchingStatus, setLotMatchingStatus] = useState(null); // 'no_matching' | 'passed' | 'failed' | null
  const [matchingPassedBy, setMatchingPassedBy] = useState('');
  const [shadeTableNumbers, setShadeTableNumbers] = useState({});
  const [defaultTable, setDefaultTable] = useState('Table 1');
  const [allTables, setAllTables] = useState([]);
  
  // Eligibility verification states
  const [eligibilityChecked, setEligibilityChecked] = useState(false);
  const [tableClassificationData, setTableClassificationData] = useState(() => {
    try {
      const cached = localStorage.getItem('twms_table_classification');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [eligibilityError, setEligibilityError] = useState(null);
  const [openIssuedLotNo, setOpenIssuedLotNo] = useState('');
  
  // Special approval states
  const [specialApprovalModal, setSpecialApprovalModal] = useState(null); // { tableNo, lotsCount, lotNumbers }
  const [specialApproverName, setSpecialApproverName] = useState('');
  const [specialApprovalReason, setSpecialApprovalReason] = useState('');
  const [specialApprovalData, setSpecialApprovalData] = useState(null); // { approvedBy, reason, tableNo, approvedAt }
  const [pendingApprovalReqId, setPendingApprovalReqId] = useState(null);
  const [approvalRequests, setApprovalRequests] = useState([]);

  const displayedTables = useMemo(() => {
    let list = allTables.length > 0 ? [...allTables] : [];

    // Ensure we have at least Table 1 to Table 20 in the displayed tables list
    for (let i = 1; i <= 20; i++) {
      const tableName = `Table ${i}`;
      const exists = list.some(tbl => tbl.name === tableName);
      if (!exists) {
        list.push({
          id: `temp-${i}`,
          name: tableName,
          supervisorId: null,
          cutterMasterId: null,
          Supervisor: null
        });
      }
    }

    // Sort numerically: Table 1, Table 2, ... Table 10 ... Table 20
    list.sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.name.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    if (loggedInUser?.role === 'Admin') {
      return list;
    }
    const supervisorTables = list.filter(tbl => tbl.supervisorId === loggedInUser?.id);
    if (supervisorTables.length > 0) {
      return supervisorTables;
    }
    return list;
  }, [allTables, loggedInUser]);

  // Synchronize defaultTable when displayedTables resolves/changes
  useEffect(() => {
    if (displayedTables.length > 0) {
      setDefaultTable(displayedTables[0].name);
    }
  }, [displayedTables]);

  // Kharcha (accessories/expense) issuance
  const [kharchaItems, setKharchaItems] = useState([{ id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
  const [noKharcha, setNoKharcha] = useState(false);

  const barcodeInputRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const historyObserverRef = useRef(null);
  const historyEndRef = useRef(null);


  const API_BASE_URL = BASE_URL;
  const BASE_SHADE_FILTER = 'RUST';

  // Load logged in user data
  useEffect(() => {
    const userData = localStorage.getItem('twms_user');
    if (userData) {
      setLoggedInUser(JSON.parse(userData));
    }
  }, []);

  // Fetch dynamic tables list on load
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const res = await store.getTables();
        if (res.success && res.data && res.data.length > 0) {
          setAllTables(res.data);
          setDefaultTable(res.data[0].name);
        }
      } catch (err) {
        console.error('Error fetching tables in IssuePage:', err);
      }
    };
    fetchTables();
  }, []);

  const getDisplayName = () => {
    return loggedInUser?.name || loggedInUser?.id || 'User';
  };

  // Helper function to normalize shade names by removing any bracketed suffixes like [2] and any parenthetical descriptors
  const normalizeShadeName = (shadeName) => {
    if (!shadeName) return '';
    return shadeName
      .replace(/\[.*?\]/g, '') // remove [...] parts
      .replace(/\(.*?\)/g, '') // remove (...) parts
      .trim()
      .replace(/\s+/g, ' ');
  };

  // Helper function to get shades with unique IDs (handles duplicates)
  const getShadesWithIds = (shadeStr) => {
    if (!shadeStr) return [];
    const shades = shadeStr.split(',').map(s => s.trim());
    return shades.map((shade, index) => ({
      id: `${shade}_${index}`,
      name: shade,
      normalizedName: normalizeShadeName(shade),
      originalIndex: index
    }));
  };

  // Get the current selected shade object
  const getCurrentSelectedShade = () => {
    const selectedShadeId = Object.keys(selectedShades).find(key => selectedShades[key] === true);
    if (!selectedShadeId || !selectedJob) return null;

    const allShades = getShadesWithIds(selectedJob['Shade']);
    return allShades.find(s => s.id === selectedShadeId);
  };

  // Auto-focus barcode input when shade selection changes
  useEffect(() => {
    if (barcodeInputRef.current && Object.keys(selectedShades).length > 0) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [selectedShades]);

  useEffect(() => {
    if (selectedJob && barcodeInputRef.current) {
      if (Object.keys(selectedShades).length > 0) {
        setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 100);
      }
    }
  }, [selectedJob]);

  // Fetch all issued barcodes from backend (global tracking)
  const fetchAllIssuedBarcodes = async () => {
    setIsLoadingBarcodes(true);
    try {
      console.log('📡 Fetching all issued barcodes from Google Sheets...');
      const response = await fetch(`${API_BASE_URL}/all-issued-barcodes`);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const resData = await response.json();

      if (resData.success && resData.data) {
        const barcodeSet = new Set(resData.data);
        setGlobalIssuedBarcodes(barcodeSet);
        console.log(`✅ Loaded ${barcodeSet.size} unique issued barcodes from Google Sheets`);

        localStorage.setItem('globalIssuedBarcodes', JSON.stringify(Array.from(barcodeSet)));
        localStorage.setItem('globalIssuedBarcodesLastUpdated', new Date().toISOString());

        return barcodeSet;
      } else {
        console.warn('⚠️ Failed to fetch issued barcodes, using localStorage backup');
        return loadIssuedBarcodesFromLocalStorage();
      }
    } catch (error) {
      console.error('Error fetching issued barcodes:', error);
      return loadIssuedBarcodesFromLocalStorage();
    } finally {
      setIsLoadingBarcodes(false);
    }
  };

  // Load from localStorage backup
  const loadIssuedBarcodesFromLocalStorage = () => {
    const stored = localStorage.getItem('globalIssuedBarcodes');
    if (stored) {
      const barcodeArray = JSON.parse(stored);
      const barcodeSet = new Set(barcodeArray);
      setGlobalIssuedBarcodes(barcodeSet);
      console.log(`📦 Loaded ${barcodeSet.size} barcodes from localStorage backup`);
      return barcodeSet;
    }
    return new Set();
  };

  // Check if barcode was ever issued globally or in the current session
  const isBarcodeGloballyIssued = (barcodeId) => {
    // Only cache positive duplicate matches to avoid stale negatives
    if (duplicateCheckCache[barcodeId] === true) {
      return true;
    }

    if (globalIssuedBarcodes.has(barcodeId)) {
      setDuplicateCheckCache(prev => ({ ...prev, [barcodeId]: true }));
      return true;
    }

    // Filter out metadata objects like '_party' or '_location' to get clean arrays of barcode IDs
    const currentSessionBarcodes = Object.keys(scannedBarcodes)
      .filter(key => !key.endsWith('_party') && !key.endsWith('_location'))
      .flatMap(key => scannedBarcodes[key] || []);

    if (currentSessionBarcodes.includes(barcodeId)) {
      setDuplicateCheckCache(prev => ({ ...prev, [barcodeId]: true }));
      return true;
    }

    for (const record of issueHistory) {
      const items = record.items || record.issuedItems;
      if (items) {
        for (const item of items) {
          if (item.barcodeIds) {
            if (Array.isArray(item.barcodeIds) && item.barcodeIds.includes(barcodeId)) {
              setDuplicateCheckCache(prev => ({ ...prev, [barcodeId]: true }));
              return true;
            }
            if (typeof item.barcodeIds === 'string' && item.barcodeIds.includes(barcodeId)) {
              setDuplicateCheckCache(prev => ({ ...prev, [barcodeId]: true }));
              return true;
            }
          }
        }
      }

      if (record.barcodeIds) {
        if (Array.isArray(record.barcodeIds) && record.barcodeIds.includes(barcodeId)) {
          setDuplicateCheckCache(prev => ({ ...prev, [barcodeId]: true }));
          return true;
        }
        if (typeof record.barcodeIds === 'string' && record.barcodeIds.includes(barcodeId)) {
          setDuplicateCheckCache(prev => ({ ...prev, [barcodeId]: true }));
          return true;
        }
      }
    }

    return false;
  };

  const fetchSheetData = async () => {
    // Optimized: Skip loading all job orders and fabric rolls on mount for instant load.
    setLoading(false);
  };

  const fetchApprovalRequests = useCallback(async () => {
    try {
      const data = await store.getApprovalRequests();
      if (Array.isArray(data)) {
        setApprovalRequests(prev => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      }
    } catch (err) {
      console.error('Error fetching approval requests in IssuePage:', err);
    }
  }, []);

  const getApprovedRequestForTable = useCallback((tableName, targetLotNumber = null) => {
    if (!tableName || !Array.isArray(approvalRequests)) return null;
    const norm = str => (str || '').replace(/\s+/g, '').toLowerCase();
    const cleanName = norm(tableName);
    return approvalRequests.find(r => 
      r.tableNo && 
      norm(r.tableNo) === cleanName && 
      r.status === 'Approved' &&
      (!targetLotNumber || !r.lotNumber || norm(r.lotNumber) === norm(targetLotNumber))
    ) || null;
  }, [approvalRequests]);

  const fetchTableClassification = async (forceRefresh = false) => {
    setLoadingEligibility(true);
    setEligibilityError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/reports/table-wise-classification`);
      if (!res.ok) throw new Error('Failed to fetch table wise classification');
      const resData = await res.json();
      if (resData.success && Array.isArray(resData.data)) {
        setTableClassificationData(resData.data);
        localStorage.setItem('twms_table_classification', JSON.stringify(resData.data));
      }
    } catch (err) {
      console.error('Error loading table capacity classification:', err);
      setEligibilityError('Could not verify table classification data.');
    } finally {
      setLoadingEligibility(false);
    }
  };

  useEffect(() => {
    fetchSheetData();
    fetchAllIssuedBarcodes();
    fetchTableClassification();
    fetchApprovalRequests();

    const interval = setInterval(() => {
      fetchApprovalRequests();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchApprovalRequests]);

  const handleSelectTable = (tableNo) => {
    const tableData = tableClassificationData.find(
      t => t.tableNumber.trim().toLowerCase() === tableNo.trim().toLowerCase()
    );
    
    const approvedReq = getApprovedRequestForTable(tableNo, searchLot || openIssuedLotNo || null);
    const isApproved = Boolean(approvedReq);

    if (tableData && Array.isArray(tableData.lots) && tableData.lots.length >= 2 && !isApproved && loggedInUser?.role !== 'Admin') {
      const lotNumbers = tableData.lots.map(l => l.lotNumber).join(', ');
      setSpecialApprovalModal({
        tableNo,
        lotsCount: tableData.lots.length,
        lotNumbers
      });
      setSpecialApproverName(defaultApproverName || loggedInUser?.name || '');
      setSpecialApprovalReason('');
      setPendingApprovalReqId(null);
      return;
    }

    if (approvedReq) {
      setSpecialApprovalData({
        approvedBy: approvedReq.respondedBy || 'Admin',
        reason: approvedReq.reason || 'Admin Approved',
        tableNo: approvedReq.tableNo,
        approvedAt: approvedReq.respondedAt || new Date().toISOString()
      });
    } else {
      setSpecialApprovalData(null);
    }

    setDefaultTable(tableNo);
    setEligibilityChecked(true);
  };

  const handleRequestAdminApproval = async () => {
    if (!specialApproverName.trim()) {
      alert('⚠️ Please enter Requester / Person Name.');
      return;
    }

    try {
      const res = await store.createApprovalRequest({
        lotNumber: searchLot || openIssuedLotNo || 'LOT-NEW',
        tableNo: specialApprovalModal.tableNo,
        requestedBy: specialApproverName.trim(),
        reason: specialApprovalReason.trim() || 'Eligibility Criteria Override'
      });

      if (res && res.data) {
        setPendingApprovalReqId(res.data.id);
        fetchApprovalRequests();
      }
    } catch (err) {
      alert('Failed to send approval request: ' + err.message);
    }
  };

  // Poll approval status when an approval request is pending
  useEffect(() => {
    if (!pendingApprovalReqId) return;

    const interval = setInterval(async () => {
      try {
        const req = await store.checkApprovalStatus(pendingApprovalReqId);
        if (req) {
          if (req.status === 'Approved') {
            setSpecialApprovalData({
              approvedBy: req.respondedBy || 'Admin',
              reason: req.reason || 'Admin Approved',
              tableNo: req.tableNo,
              approvedAt: req.respondedAt || new Date().toISOString()
            });
            setDefaultTable(req.tableNo);
            setEligibilityChecked(true);
            setSpecialApprovalModal(null);
            setPendingApprovalReqId(null);
            fetchApprovalRequests();
            alert(`✅ Special Approval Granted by Admin (${req.respondedBy || 'Admin'})!\n\nYou are now allowed to issue weight & stickers against ${req.tableNo}.`);
          } else if (req.status === 'Rejected') {
            setSpecialApprovalModal(null);
            setPendingApprovalReqId(null);
            fetchApprovalRequests();
            alert(`❌ Approval Request REJECTED by Admin (${req.respondedBy || 'Admin'}).\n\nIssuance weight is NOT allowed against this table.`);
          }
        }
      } catch (err) {
        console.error('Error polling approval status:', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [pendingApprovalReqId, fetchApprovalRequests]);

  const handleOpenIssuedLot = (lotNo) => {
    if (!lotNo.trim()) return;
    
    let foundTable = null;
    for (const group of tableClassificationData) {
      if (group.lots && group.lots.some(l => String(l.lotNumber).trim() === lotNo.trim())) {
        foundTable = group.tableNumber;
        break;
      }
    }
    
    if (foundTable) {
      setDefaultTable(foundTable);
      setEligibilityChecked(true);
      setTimeout(() => {
        performSearch(lotNo.trim(), foundTable);
      }, 50);
    } else {
      alert(`Lot Number ${lotNo} is not active on any cutting table. Please select an eligible table from the grid below to create a new issuance.`);
    }
  };

  const performSearch = async (lotVal, tableVal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/job-orders/search/${lotVal.trim()}`);
      if (!response.ok) {
        throw new Error('Lot Number not found');
      }

      const resData = await response.json();
      if (resData.success && resData.data) {
        const found = resData.data;
        setSelectedJob(found);
        setIssueQuantity({});
        setIssueWeight({});
        setSelectedShades({});
        setScannedBarcodes({});
        setFabricApprovals({});
        setDefaultApproverName('');
        setMatchingModal(null);
        setLotScanningAllowed(null);
        setLotMatchingStatus(null);
        setMatchingPassedBy('');
        
        // Auto-assign all shades to the selected table
        const initialTables = {};
        const allShades = getShadesWithIds(found['Shade']);
        allShades.forEach(s => {
          initialTables[s.id] = tableVal;
        });
        setShadeTableNumbers(initialTables);
        setDefaultTable(tableVal);
        
        setKharchaItems([{ id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
        setNoKharcha(false);
        setHistoryPage(1);
        setHasMoreHistory(true);
        
        await loadIssueHistoryPaginated(found['Lot Number'], 1, true);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error searching lot');
      setEligibilityChecked(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchLot.trim()) {
      setSelectedJob(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      console.log(`Searching Lot Number via backend: ${searchLot.trim()}`);

      const response = await fetch(`${API_BASE_URL}/job-orders/search/${searchLot.trim()}`);
      if (!response.ok) {
        throw new Error('Lot Number not found');
      }

      const resData = await response.json();
      if (resData.success && resData.data) {
        const found = resData.data;
        setSelectedJob(found);
        setIssueQuantity({});
        setIssueWeight({});
        setSelectedShades({});
        setScannedBarcodes({});
        setFabricApprovals({});
        setDefaultApproverName('');
        setMatchingModal(null);
        setLotScanningAllowed(null);
        setLotMatchingStatus(null);
        setMatchingPassedBy('');
        // Auto-assign all shades to the default table
        const initialTables = {};
        const allShades = getShadesWithIds(found['Shade']);
        allShades.forEach(s => {
          initialTables[s.id] = defaultTable || (displayedTables[0]?.name || 'Table 1');
        });
        setShadeTableNumbers(initialTables);
        setKharchaItems([{ id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
        setNoKharcha(false);
        // Reset pagination when loading new lot
        setHistoryPage(1);
        setHasMoreHistory(true);
        
        // Load history and look for prior matching status in database
        const historyList = await loadIssueHistoryPaginated(found['Lot Number'], 1, true);
        
        let prevMatchingStatus = null;
        let prevMatchingPassedBy = '';
        
        if (historyList && historyList.length > 0) {
          const matchedRecord = historyList.find(rec => rec.matchingStatus);
          if (matchedRecord) {
            prevMatchingStatus = matchedRecord.matchingStatus;
            prevMatchingPassedBy = matchedRecord.matchingPassedBy;
          }
        }
        
        // If not in database, check localStorage
        if (!prevMatchingStatus) {
          const localMatch = localStorage.getItem(`lot_matching_${found['Lot Number']}`);
          if (localMatch) {
            try {
              const parsed = JSON.parse(localMatch);
              if (parsed && parsed.status) {
                prevMatchingStatus = parsed.status;
                prevMatchingPassedBy = parsed.passedBy || '';
              }
            } catch (err) {
              console.error('Failed to parse local matching status:', err);
            }
          }
        }
        
        if (prevMatchingStatus) {
          console.log(`✨ Restoring prior matching status for lot ${found['Lot Number']}: ${prevMatchingStatus} (Approved by: ${prevMatchingPassedBy})`);
          setLotMatchingStatus(prevMatchingStatus);
          setMatchingPassedBy(prevMatchingPassedBy || '');
          setLotScanningAllowed(prevMatchingStatus === 'passed' || prevMatchingStatus === 'no_matching');
          setMatchingModal(null);
        } else {
          // No prior matching status found, prompt for matching
          setTimeout(() => setMatchingModal({ step: 'ask_matching' }), 400);
        }

        // Fetch prior approvals for this lot from database
        try {
          const apprvRes = await fetch(`${API_BASE_URL}/fabric-approvals/${encodeURIComponent(found['Lot Number'])}`);
          if (apprvRes.ok) {
            const apprvData = await apprvRes.json();
            if (apprvData && apprvData.success && apprvData.data && apprvData.data.length > 0) {
              const lastApproval = apprvData.data.find(a => a.approvedBy && a.approvedBy.trim());
              if (lastApproval) {
                setDefaultApproverName(lastApproval.approvedBy);
                console.log(`📜 Loaded prior approval name: "${lastApproval.approvedBy}" from database.`);
              }
            }
          }
        } catch (apprvErr) {
          console.error('Error fetching approvals for lot:', apprvErr);
        }
      } else {
        setSelectedJob(null);
        alert('Lot Number not found');
      }
    } catch (err) {
      setSelectedJob(null);
      alert(err.message || 'Lot Number not found');
    } finally {
      setLoading(false);
    }
  };

  const handleDefaultTableChange = (val) => {
    setDefaultTable(val);
    if (selectedJob) {
      const updated = { ...shadeTableNumbers };
      const allShades = getShadesWithIds(selectedJob['Shade']);
      allShades.forEach(s => {
        updated[s.id] = val;
      });
      setShadeTableNumbers(updated);
    }
  };

  // Get total issued weight for a specific shade (from all historical issuances)
  const getTotalIssuedWeightForShade = (shadeName, shadeEntry = null) => {
    let totalWeight = 0;
    let totalRolls = 0;
    const allBarcodes = [];

    issueHistory.forEach(record => {
      if (record.items && record.items.length > 0) {
        record.items.forEach(item => {
          const shadeMatches = item.shade === shadeName;
          const entryMatches = shadeEntry === null || item.shadeEntry === shadeEntry;

          if (shadeMatches && entryMatches) {
            totalWeight += parseFloat(item.weight) || 0;
            totalRolls += parseInt(item.qty || item.quantity) || 0;
            if (item.barcodeIds) {
              allBarcodes.push(...item.barcodeIds);
            }
          }
        });
      }
    });

    return { totalWeight, totalRolls, allBarcodes };
  };

  // Get total issued for entire lot
  const getTotalLotIssued = () => {
    let totalWeight = 0;
    let totalRolls = 0;
    const allBarcodes = [];

    issueHistory.forEach(record => {
      totalWeight += parseFloat(record.totalWeight) || 0;
      totalRolls += parseInt(record.totalRolls || record.totalQuantity) || 0;
      if (record.barcodeIds) {
        allBarcodes.push(...record.barcodeIds);
      }
    });

    return { totalWeight, totalRolls, allBarcodes };
  };

  // NEW: Load issuance history with pagination
  const loadIssueHistoryPaginated = async (lotNumber, page = 1, resetHistory = false) => {
    if (!lotNumber) return;

    if (resetHistory) {
      setLoadingHistory(true);
      setIssueHistory([]);
    } else {
      setLoadingHistory(true);
    }

    try {
      console.log(`📡 Loading paginated issuance history for lot: ${lotNumber}, Page: ${page}`);

      const response = await fetch(`${API_BASE_URL}/issuance-history/${lotNumber}?page=${page}&pageSize=20`);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const resData = await response.json();

      if (resData.success && resData.data) {
        const historyData = resData.data;
        const pagination = resData.pagination;

        if (resetHistory) {
          setIssueHistory(historyData);
        } else {
          setIssueHistory(prev => [...prev, ...historyData]);
        }

        setHistoryPage(pagination?.currentPage || page);
        setHistoryTotalPages(pagination?.totalPages || 1);
        setHistoryTotalRows(pagination?.totalRows || historyData.length);
        setHasMoreHistory(pagination?.hasNextPage || false);

        console.log(`✅ Loaded ${historyData.length} issuance records (Page ${page}/${pagination?.totalPages || 1})`);

        // Store in localStorage as backup
        if (resetHistory) {
          localStorage.setItem(`fabric_issue_${lotNumber}`, JSON.stringify(historyData));
        }

        return historyData;
      }
      return [];

    } catch (error) {
      console.error('Error loading paginated history from backend:', error);

      // Fallback to localStorage if available
      if (resetHistory) {
        const stored = localStorage.getItem(`fabric_issue_${lotNumber}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setIssueHistory(parsed);
          setHasMoreHistory(false);
          return parsed;
        }
      }
      return [];

    } finally {
      setLoadingHistory(false);
    }
  };

  // Load next page of history (infinite scroll)
  const loadMoreHistory = useCallback(() => {
    if (!hasMoreHistory || loadingHistory || !selectedJob) return;

    const nextPage = historyPage + 1;
    if (nextPage <= historyTotalPages) {
      loadIssueHistoryPaginated(selectedJob['Lot Number'], nextPage, false);
    }
  }, [hasMoreHistory, loadingHistory, historyPage, historyTotalPages, selectedJob]);

  // Set up intersection observer for infinite scroll on history
  useEffect(() => {
    if (!historyEndRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreHistory && !loadingHistory) {
          loadMoreHistory();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(historyEndRef.current);

    return () => {
      if (observer) observer.disconnect();
    };
  }, [hasMoreHistory, loadingHistory, loadMoreHistory]);

  // Store issuance in Google Sheets via backend
  const storeIssuanceInGoogleSheets = async (issuanceRecord) => {
    try {
      console.log('📤 Storing issuance to backend:', issuanceRecord);

      const payload = {
        ...issuanceRecord,
        barcodeIds: issuanceRecord.barcodeIds || [],
        issuedItems: issuanceRecord.issuedItems.map(item => ({
          ...item,
          barcodeIds: item.barcodeIds || []
        }))
      };

      const response = await fetch(`${API_BASE_URL}/store-fabric-issuance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const resData = await response.json();

      if (resData.success) {
        console.log('✓ Issuance stored successfully:', resData);
        return { success: true, data: resData.data || resData };
      } else {
        console.warn('⚠️ Storage issue:', resData.message);
        return { success: false, message: resData.message };
      }

    } catch (error) {
      console.error('❌ Error storing issuance:', error);

      let errorMsg = '';
      if (error.code === 'ECONNREFUSED') {
        errorMsg = 'Backend server not running. Data saved offline.';
      } else if (error.code === 'ERR_NETWORK') {
        errorMsg = 'Network error. Data saved offline.';
      } else {
        errorMsg = error.message;
      }

      return { success: false, message: errorMsg, offline: true };
    }
  };

  // Sync offline issuances when back online
  const syncOfflineIssuances = async () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineFabricIssuances') || '[]');

    if (offlineData.length === 0) return;

    console.log(`🔄 Syncing ${offlineData.length} offline issuances...`);

    try {
      const response = await fetch(`${API_BASE_URL}/sync-offline-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          offlineData: offlineData,
          dataType: 'issuance'
        })
      });
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const resData = await response.json();

      if (resData.success) {
        console.log('✓ Offline issuances synced:', resData);
        localStorage.removeItem('offlineFabricIssuances');
        alert(`✓ Synced ${offlineData.length} offline issuances to Google Sheets`);
      }
    } catch (error) {
      console.error('Failed to sync offline issuances:', error);
    }
  };

  const handleReceiveComplete = (receivingRecord) => {
    console.log('Receiving completed:', receivingRecord);

    if (receivingRecord) {
      if (receivingRecord.totalQuantity !== undefined) {
        alert(`✅ Fabric Return Recorded!\n\n📦 Total Returned: ${receivingRecord.totalQuantity} units\n⚖️ Total Weight: ${(parseFloat(receivingRecord.totalWeight) || 0).toFixed(2)} kg`);
      } else if (receivingRecord.shadeName) {
        alert(`✅ Shade Return Recorded!\n\n🎨 Shade: ${receivingRecord.shadeName}\n⚖️ Return Weight: ${(parseFloat(receivingRecord.returnWeight || receivingRecord.weight) || 0).toFixed(2)} kg\n📦 Processed across multiple rolls`);
      } else {
        alert(`✅ Fabric Return Recorded!\n\n📦 Barcode: ${receivingRecord.barcodeId || 'N/A'}\n🎨 Shade: ${receivingRecord.shade || 'N/A'}\n⚖️ Return Weight: ${(parseFloat(receivingRecord.returnWeight || receivingRecord.weight) || 0).toFixed(2)} kg\n📝 Reason: ${receivingRecord.reason || 'Returned'}`);
      }
    } else {
      alert('✅ Fabric return recorded successfully!');
    }

    if (selectedJob) {
      // Reload history from first page after return
      loadIssueHistoryPaginated(selectedJob['Lot Number'], 1, true);
    }
  };

  // ── Kharcha handlers ───────────────────────────────────────────────
  const addKharchaRow = () => {
    setKharchaItems(prev => [...prev, { id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
  };

  const removeKharchaRow = (id) => {
    setKharchaItems(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  };

  const updateKharchaRow = (id, field, value) => {
    setKharchaItems(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const getTotalKharchaWeight = () => {
    return kharchaItems.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0);
  };

  const handleKharchaBarcodeSearch = async (rowId, barcodeVal) => {
    const cleanBarcode = barcodeVal.replace(/[\n\r\t\s]/g, '').trim();
    if (!cleanBarcode) return;

    // Check if barcode is already scanned in this row
    const currentRow = kharchaItems.find(r => r.id === rowId);
    if (currentRow && currentRow.barcodes && currentRow.barcodes.some(b => b.barcodeId === cleanBarcode)) {
      alert(`Barcode "${cleanBarcode}" has already been scanned for this item.`);
      return;
    }

    setKharchaItems(prev => prev.map(r => r.id === rowId ? { ...r, loading: true } : r));

    try {
      console.log('🔍 Searching barcode for Kharcha:', cleanBarcode);
      const response = await fetch(`${API_BASE_URL}/google-sheets/fabric-roll/${encodeURIComponent(cleanBarcode)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Barcode "${cleanBarcode}" not found in inventory`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        const status = (result.data['Status'] || result.data.status || 'in_stock').toLowerCase();
        if (status === 'issued') {
          throw new Error(`Barcode "${cleanBarcode}" has already been issued!`);
        }
        const weight = parseFloat(result.data['Weight (KG)'] || result.data.weight || result.data.stockKg || 0);
        
        setKharchaItems(prev => prev.map(r => {
          if (r.id === rowId) {
            const updatedBarcodes = [...(r.barcodes || []), { barcodeId: cleanBarcode, weight: weight }];
            const totalWeight = updatedBarcodes.reduce((sum, b) => sum + b.weight, 0);
            return {
              ...r,
              barcodes: updatedBarcodes,
              weight: totalWeight.toFixed(2),
              barcodeInput: '', // Clear input for next scan
              loading: false
            };
          }
          return r;
        }));
      } else {
        throw new Error(`Barcode "${cleanBarcode}" not found in inventory`);
      }
    } catch (err) {
      alert(err.message || 'Error searching barcode');
      setKharchaItems(prev => prev.map(r => r.id === rowId ? { ...r, loading: false } : r));
    }
  };

  const removeKharchaBarcode = (rowId, barcodeId) => {
    setKharchaItems(prev => prev.map(r => {
      if (r.id === rowId) {
        const updatedBarcodes = (r.barcodes || []).filter(b => b.barcodeId !== barcodeId);
        const totalWeight = updatedBarcodes.reduce((sum, b) => sum + b.weight, 0);
        return {
          ...r,
          barcodes: updatedBarcodes,
          weight: updatedBarcodes.length > 0 ? totalWeight.toFixed(2) : ''
        };
      }
      return r;
    }));
  };

  const toggleShadeSelection = (shadeId) => {
    if (selectedShades[shadeId]) {
      // Deselect
      setSelectedShades({});
    } else {
      // Select
      const newSelection = {};
      newSelection[shadeId] = true;
      setSelectedShades(newSelection);
    }
  };

  const selectFirstShade = () => {
    const allShadesWithIds = getShadesWithIds(selectedJob['Shade']);
    if (allShadesWithIds.length > 0) {
      const firstId = allShadesWithIds[0].id;
      const newSelection = {};
      newSelection[firstId] = true;
      setSelectedShades(newSelection);
      console.log('Selected first shade entry:', allShadesWithIds[0].name, '(Entry 1)');
    }
  };

  const deselectAllShades = () => {
    setSelectedShades({});
  };

  // Handle matching modal responses (global — one check per lot)
  const handleMatchingResponse = (hasMatching) => {
    if (!matchingModal) return;
    if (!hasMatching) {
      // No matching needed — allow scanning directly
      setLotScanningAllowed(true);
      setLotMatchingStatus('no_matching');
      setMatchingPassedBy('');
      
      if (selectedJob) {
        localStorage.setItem(`lot_matching_${selectedJob['Lot Number']}`, JSON.stringify({
          status: 'no_matching',
          passedBy: ''
        }));
      }

      setMatchingModal(null);
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } else {
      // Ask if matching passed
      setMatchingModal({ step: 'ask_passed' });
    }
  };

  const handleMatchingPassedResponse = (passed) => {
    if (!matchingModal) return;
    if (passed) {
      // Ask from whom in senior management the matching was passed
      setMatchingModal({ step: 'ask_approver' });
    } else {
      // Matching failed — block all scanning
      setLotScanningAllowed(false);
      setLotMatchingStatus('failed');
      setMatchingPassedBy('');
      
      if (selectedJob) {
        localStorage.setItem(`lot_matching_${selectedJob['Lot Number']}`, JSON.stringify({
          status: 'failed',
          passedBy: ''
        }));
      }

      setMatchingModal(null);
      alert('⛔ Matching Failed! Barcode scanning is not allowed for this lot.');
    }
  };

  const handleMatchingApproverSubmit = (approverName) => {
    if (!approverName || !approverName.trim()) {
      alert("Please enter the name of the senior management person.");
      return;
    }
    const cleanName = approverName.trim();
    setMatchingPassedBy(cleanName);
    setLotScanningAllowed(true);
    setLotMatchingStatus('passed');
    
    if (selectedJob) {
      localStorage.setItem(`lot_matching_${selectedJob['Lot Number']}`, JSON.stringify({
        status: 'passed',
        passedBy: cleanName
      }));
    }

    setMatchingModal(null);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  const processBarcode = async (barcodeData) => {
    if (!selectedJob) {
      alert('Please select a Lot Number first');
      setBarcodeInput('');
      return;
    }

    const selectedShadeIds = Object.keys(selectedShades).filter(shadeId => selectedShades[shadeId]);
    if (selectedShadeIds.length === 0) {
      alert('Please select a shade entry before scanning');
      setBarcodeInput('');
      return;
    }

    // Check if scanning is allowed globally for this lot
    if (lotScanningAllowed === false) {
      alert('⛔ Scanning not allowed — matching was not passed for this lot.');
      setBarcodeInput('');
      return;
    }
    if (lotScanningAllowed === null) {
      alert('⚠️ Please complete the matching check before scanning.');
      setBarcodeInput('');
      return;
    }

    if (selectedShadeIds.length > 1) {
      alert('Error: Multiple shades selected. Please select only one shade entry.');
      setSelectedShades({});
      setBarcodeInput('');
      return;
    }

    const allShadesWithIds = getShadesWithIds(selectedJob['Shade']);
    const selectedShadeObj = allShadesWithIds.find(s => s.id === selectedShadeIds[0]);
    const selectedShadeName = selectedShadeObj ? selectedShadeObj.name : '';
    const selectedShadeNormalizedName = selectedShadeObj ? selectedShadeObj.normalizedName : '';
    const selectedShadeId = selectedShadeIds[0];
    const selectedShadeEntryNum = selectedShadeObj ? selectedShadeObj.originalIndex + 1 : 1;

    let barcodeId = barcodeData;
    let scannedWeight = null;

    if (barcodeData.includes('|')) {
      const parts = barcodeData.split('|');
      barcodeId = parts[0].trim();
      scannedWeight = parseFloat(parts[1].trim());
    }

    barcodeId = barcodeId.replace(/[\n\r\t\s]/g, '').trim();

    // Check if barcode is already scanned in the current session
    const isAlreadyScanned = Object.values(scannedBarcodes).some(barcodes => 
      Array.isArray(barcodes) && barcodes.includes(barcodeId)
    );
    if (isAlreadyScanned) {
      alert(`❌ DUPLICATE SCAN REJECTED!\n\nBarcode ID: ${barcodeId}\n\nThis barcode has already been scanned in this session.`);
      setBarcodeInput('');
      return;
    }

    console.log('🔍 Searching for Barcode ID (On-demand):', barcodeId);

    let matchingRoll = null;
    try {
      const response = await fetch(`${API_BASE_URL}/google-sheets/fabric-roll/${encodeURIComponent(barcodeId)}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          matchingRoll = result.data;
        }
      }
    } catch (err) {
      console.error('Error fetching roll barcode on-demand:', err);
    }

    if (!matchingRoll) {
      alert(`❌ Barcode ID "${barcodeId}" not found in inventory!`);
      setBarcodeInput('');
      return;
    }

    const rollStatus = (matchingRoll['Status'] || 'in_stock').toLowerCase();
    if (rollStatus === 'issued') {
      alert(`❌ Roll ${barcodeId} has already been issued!\n\nStatus: ${rollStatus}`);
      setBarcodeInput('');
      return;
    }

    const isReturnRoll = Boolean(matchingRoll.isReturn || barcodeId.startsWith('R') || barcodeId.startsWith('RET-'));
    if (!isReturnRoll && rollStatus !== 'in_stock' && isBarcodeGloballyIssued(barcodeId)) {
      alert(`❌ DUPLICATE BARCODE REJECTED!\n\nBarcode ID: ${barcodeId}\n\nThis barcode has ALREADY BEEN ISSUED in a previous transaction.`);
      setBarcodeInput('');
      return;
    }

    const rollItemDescription = matchingRoll['Item Description'] || '';
    const jobFabric = selectedJob['Fabric'] || '';

    const fabricMatch = rollItemDescription.toLowerCase().includes(jobFabric.toLowerCase()) ||
      jobFabric.toLowerCase().includes(rollItemDescription.toLowerCase()) ||
      (isReturnRoll && matchingRoll['Lot Number'] && String(matchingRoll['Lot Number']) === String(selectedJob['Lot Number']));

    const rollShade = matchingRoll['Shade'] || '';
    const normalizedRollShade = normalizeShadeName(rollShade);
    const shadeMatch = normalizedRollShade.toLowerCase() === selectedShadeNormalizedName.toLowerCase() ||
      (isReturnRoll && (!selectedShadeNormalizedName || normalizedRollShade.toLowerCase().includes(selectedShadeNormalizedName.toLowerCase())));

    // Check if there is any mismatch (fabric or shade)
    if (!fabricMatch || !shadeMatch) {
      let mismatchMsg = '';
      if (!fabricMatch) mismatchMsg += `• Fabric Mismatch!\n  Scanned: "${rollItemDescription}"\n  Required: "${jobFabric}"\n`;
      if (!shadeMatch) mismatchMsg += `• Shade Mismatch!\n  Scanned: "${rollShade}"\n  Selected: "${selectedShadeName}"\n`;

      let approverName = defaultApproverName;

      if (!approverName) {
        const confirmMessage = `⚠️ Mismatch Detected!\n\n${mismatchMsg}\nDo you want to request approval for this mismatch?`;
        const allowChange = window.confirm(confirmMessage);
        if (allowChange) {
          const inputName = window.prompt("Enter name of the person who approved this mismatch (Shade/Fabric):");
          if (inputName && inputName.trim()) {
            approverName = inputName.trim();
            setDefaultApproverName(approverName); // Cache approval name
            console.log(`✅ Mismatch approved by: "${approverName}"`);
          } else {
            alert("❌ Approval name not entered. Mismatch rejected.");
            setBarcodeInput('');
            return;
          }
        } else {
          alert(`❌ Mismatch rejected.`);
          setBarcodeInput('');
          return;
        }
      } else {
        // Reuse default approval name
        console.log(`✅ Mismatch automatically approved using prior cached approver: "${approverName}"`);
        alert(`⚠️ Mismatch Warning!\n\n${mismatchMsg}\nAutomatically approved by: "${approverName}"`);
      }

      // Record approval for this barcode
      setFabricApprovals(prev => ({
        ...prev,
        [barcodeId]: {
          barcodeId,
          requiredFabric: jobFabric,
          scannedFabric: rollItemDescription,
          requiredShade: selectedShadeName,
          scannedShade: rollShade,
          approvedBy: approverName
        }
      }));
    }

    const partyName = matchingRoll['Party'] || matchingRoll['cmfName'] || matchingRoll['Cmf Name'] || matchingRoll['CMP Name'] || '';

    console.log(`🏭 Found Party Name for roll ${barcodeId}: "${partyName}"`);

    if (!partyName) {
      console.warn(`⚠️ WARNING: No party name found for barcode ${barcodeId}. Party column might be empty.`);
    }

    const rollLocation = matchingRoll['Location'] || '';

    // Check if unit is MTR and no weight is supplied in barcode
    const isMtr = matchingRoll['Unit'] && matchingRoll['Unit'].toUpperCase().includes('MTR');
    if (isMtr && scannedWeight === null) {
      setMtrWeightModal({
        barcodeId,
        matchingRoll,
        selectedShadeId,
        selectedShadeName,
        selectedShadeEntryNum,
        partyName,
        rollLocation,
        rollItemDescription,
        rollShade
      });
      setBarcodeInput('');
      return;
    }

    let finalWeight = 0;
    if (scannedWeight && !isNaN(scannedWeight)) {
      finalWeight = scannedWeight;
    } else if (matchingRoll['MRN WT']) {
      finalWeight = parseFloat(matchingRoll['MRN WT']) || 0;
    } else if (matchingRoll['Weight (KG)']) {
      finalWeight = parseFloat(matchingRoll['Weight (KG)']) || 0;
    }

    if (finalWeight <= 0) {
      alert(`⚠️ Warning: Invalid weight (${finalWeight} kg) for roll ${barcodeId}`);
      setBarcodeInput('');
      return;
    }

    const newIssueWeight = { ...issueWeight };
    const newIssueQuantity = { ...issueQuantity };
    const newScannedBarcodes = { ...scannedBarcodes };

    newIssueWeight[selectedShadeId] = (newIssueWeight[selectedShadeId] || 0) + finalWeight;
    newIssueQuantity[selectedShadeId] = (newIssueQuantity[selectedShadeId] || 0) + 1;

    if (!newScannedBarcodes[selectedShadeId]) {
      newScannedBarcodes[selectedShadeId] = [];
    }

    if (newScannedBarcodes[selectedShadeId].includes(barcodeId)) {
      alert(`⚠️ Barcode ${barcodeId} is already in the current session!`);
      setBarcodeInput('');
      return;
    }

    if (!newScannedBarcodes[`${selectedShadeId}_party`]) {
      newScannedBarcodes[`${selectedShadeId}_party`] = {};
    }
    newScannedBarcodes[`${selectedShadeId}_party`][barcodeId] = partyName;

    // Store location for this barcode
    if (!newScannedBarcodes[`${selectedShadeId}_location`]) {
      newScannedBarcodes[`${selectedShadeId}_location`] = {};
    }
    newScannedBarcodes[`${selectedShadeId}_location`][barcodeId] = rollLocation;

    newScannedBarcodes[selectedShadeId].push(barcodeId);

    setIssueWeight(newIssueWeight);
    setIssueQuantity(newIssueQuantity);
    setScannedBarcodes(newScannedBarcodes);
    setScannedBarcodeWeights(prev => ({
      ...prev,
      [barcodeId]: finalWeight
    }));

    setScannedRoll({
      rollNumber: matchingRoll['Barcode ID'],
      fabric: rollItemDescription,
      shade: rollShade,
      shadeEntry: selectedShadeEntryNum,
      weight: finalWeight,
      party: partyName,
      location: matchingRoll['Location'] || '',
      timestamp: new Date().toLocaleTimeString()
    });

    console.log(`✅ Success! Added to ${selectedShadeName} (Entry ${selectedShadeEntryNum})`);
    console.log(`📊 Current session: ${newIssueQuantity[selectedShadeId]} rolls, ${newIssueWeight[selectedShadeId].toFixed(2)} kg`);
    console.log(`🏭 Party Name for this roll: ${partyName}`);

    setBarcodeInput('');

    setTimeout(() => {
      setScannedRoll(null);
    }, 3000);

    barcodeInputRef.current?.focus();
  };

  const submitMtrWeight = (enteredWeight) => {
    const weightVal = parseFloat(enteredWeight);
    if (isNaN(weightVal) || weightVal <= 0) {
      alert('Please enter a valid weight in KGS');
      return;
    }

    const {
      barcodeId,
      matchingRoll,
      selectedShadeId,
      selectedShadeName,
      selectedShadeEntryNum,
      partyName,
      rollLocation,
      rollItemDescription,
      rollShade
    } = mtrWeightModal;

    const newIssueWeight = { ...issueWeight };
    const newIssueQuantity = { ...issueQuantity };
    const newScannedBarcodes = { ...scannedBarcodes };

    newIssueWeight[selectedShadeId] = (newIssueWeight[selectedShadeId] || 0) + weightVal;
    newIssueQuantity[selectedShadeId] = (newIssueQuantity[selectedShadeId] || 0) + 1;

    if (!newScannedBarcodes[selectedShadeId]) {
      newScannedBarcodes[selectedShadeId] = [];
    }

    if (newScannedBarcodes[selectedShadeId].includes(barcodeId)) {
      alert(`⚠️ Barcode ${barcodeId} is already in the current session!`);
      setMtrWeightModal(null);
      return;
    }

    if (!newScannedBarcodes[`${selectedShadeId}_party`]) {
      newScannedBarcodes[`${selectedShadeId}_party`] = {};
    }
    newScannedBarcodes[`${selectedShadeId}_party`][barcodeId] = partyName;

    // Store location for this barcode
    if (!newScannedBarcodes[`${selectedShadeId}_location`]) {
      newScannedBarcodes[`${selectedShadeId}_location`] = {};
    }
    newScannedBarcodes[`${selectedShadeId}_location`][barcodeId] = rollLocation;

    newScannedBarcodes[selectedShadeId].push(barcodeId);

    setIssueWeight(newIssueWeight);
    setIssueQuantity(newIssueQuantity);
    setScannedBarcodes(newScannedBarcodes);
    setScannedBarcodeWeights(prev => ({
      ...prev,
      [barcodeId]: weightVal
    }));

    setScannedRoll({
      rollNumber: barcodeId,
      fabric: rollItemDescription,
      shade: rollShade,
      shadeEntry: selectedShadeEntryNum,
      weight: weightVal,
      party: partyName,
      location: rollLocation,
      timestamp: new Date().toLocaleTimeString()
    });

    console.log(`✅ Success! Added MTR roll with manual weight to ${selectedShadeName} (Entry ${selectedShadeEntryNum})`);
    console.log(`📊 Current session: ${newIssueQuantity[selectedShadeId]} rolls, ${newIssueWeight[selectedShadeId].toFixed(2)} kg`);

    setMtrWeightModal(null);
    setBarcodeInput('');
    setTimeout(() => {
      setScannedRoll(null);
    }, 3000);

    barcodeInputRef.current?.focus();
  };

  const handleBarcodeChange = (e) => {
    const value = e.target.value;
    setBarcodeInput(value);

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    scanTimeoutRef.current = setTimeout(() => {
      if (value.trim()) {
        processBarcode(value.trim());
      }
    }, 300);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      processBarcode(barcodeInput.trim());
    }
  };

  const handleBarcodeSearch = async (barcodeVal) => {
    const cleanBarcode = barcodeVal.replace(/[\n\r\t\s]/g, '').trim();
    if (!cleanBarcode) return;

    setIsSearchingRoll(true);
    setSearchRollError(null);
    setSearchedRoll(null);

    try {
      console.log('🔍 Quick searching barcode details:', cleanBarcode);
      const response = await fetch(`${API_BASE_URL}/google-sheets/fabric-roll/${encodeURIComponent(cleanBarcode)}`);

      if (!response.ok) {
        throw new Error(`Barcode "${cleanBarcode}" not found in inventory`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        setSearchedRoll(result.data);
      } else {
        throw new Error(`Barcode "${cleanBarcode}" not found in inventory`);
      }
    } catch (err) {
      console.error(err);
      setSearchRollError(err.message || 'Error searching barcode');
    } finally {
      setIsSearchingRoll(false);
    }
  };

  // ─── PDF Export: Fabric Issuance Report (Premium B&W) ────────────────────
  const exportFabricIssuancePdf = async ({
    selectedJob,
    issuedItems,
    allBarcodeIds,
    barcodeLocationMap,
    scannedBarcodes,
    issuedShadeIds,
    allShadesWithIds,
    issuedBy,
    issuanceId,
    kharchaItems
  }) => {
    const JsPDF = await loadJsPDF();

    // ── Dimensions & constants ─────────────────────────────────────────────
    const pW = 210, pH = 297, mg = 10, cW = pW - mg * 2;
    const now = new Date();
    const fmtDate = now.toLocaleDateString('en-GB');
    const fmtTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const lotNo = selectedJob['Lot Number'] || '—';

    // ── Optional garment image ──────────────────────────────────────────────
    let base64Img = '';
    const imgUrl = selectedJob['Image URL'] || '';
    if (imgUrl) {
      try { base64Img = await loadImageAsBase64ForPdf(imgUrl, { maxWidth: 300, maxHeight: 300 }); }
      catch { base64Img = ''; }
    }

    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Helper: thin rule
    const rule = (yy, lw = 0.2, r = 0, g = 0, b = 0) => {
      doc.setDrawColor(r, g, b); doc.setLineWidth(lw);
      doc.line(mg, yy, mg + cW, yy);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // PAGE GENERATION (called for each page)
    // ═══════════════════════════════════════════════════════════════════════
    const drawPageContent = (isFirstPage) => {
      // ── Border frame ────────────────────────────────────────────────────
      doc.setDrawColor(0); doc.setLineWidth(0.6);
      doc.rect(mg - 2, 6, cW + 4, pH - 12);

      if (isFirstPage) {
        // ── Company / Report title block ─────────────────────────────────
        doc.setFillColor(255); doc.setDrawColor(0); doc.setLineWidth(0.6);
        doc.rect(mg - 2, 6, cW + 4, 22, 'FD');

        // Double line below header
        doc.setLineWidth(0.3);
        doc.line(mg - 2, 28, mg + cW + 2, 28);

        doc.setTextColor(0);
        doc.setFontSize(15); doc.setFont('helvetica', 'bold');
        doc.text('FABRIC ISSUANCE WITH ROLL LOCATION', mg + 2, 16);

        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('TEXTILE WAREHOUSE MANAGEMENT SYSTEM  |  TWMS', mg + 2, 23);

        // Right side: meta
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
        doc.text(`${fmtDate}  ${fmtTime}`, pW - mg, 16, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        if (issuanceId) doc.text(`ID: ${issuanceId}`, pW - mg, 23, { align: 'right' });
      } else {
        // Continuation header — white with border
        doc.setFillColor(255); doc.setDrawColor(0); doc.setLineWidth(0.4);
        doc.rect(mg - 2, 6, cW + 4, 10, 'FD');
        doc.setTextColor(0); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
        doc.text('FABRIC ISSUANCE REPORT  (continued)', mg + 2, 13);
        doc.setFont('helvetica', 'normal');
        doc.text(`Lot: ${lotNo}  |  ${fmtDate}`, pW - mg, 13, { align: 'right' });
      }

      // Reset text color
      doc.setTextColor(0);
    };

    drawPageContent(true);
    let y = 32; // start y after header

    // ── JOB ORDER DETAILS + optional image ─────────────────────────────────
    const IMG_W = 30, IMG_H = 30;
    const hasImg = !!base64Img;
    const jobColW = hasImg ? cW - IMG_W - 4 : cW;

    // Section label
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.setTextColor(80);
    doc.text('JOB ORDER DETAILS', mg, y);
    doc.setTextColor(0);
    y += 1.5;
    rule(y, 0.3);
    y += 3;

    // Two-column job fields
    const jobFields = [
      ['Job Order No', selectedJob['Job Order No'] || '—'],
      ['Lot Number', selectedJob['Lot Number'] || '—'],
      ['Fabric', selectedJob['Fabric'] || '—'],
      ['Brand', selectedJob['Brand'] || '—'],
      ['Shade', selectedJob['Shade'] || '—'],
      ['Quantity', `${selectedJob['Quantity'] || '—'} ${selectedJob['Unit'] || ''}`],
      ['Size', selectedJob['Size'] || '—'],
      ['Season', selectedJob['Season'] || '—'],
      ['Garment Type', selectedJob['Garment Type'] || '—'],
      ['Issued By', issuedBy],
    ];

    const jcW = jobColW / 2 - 2;
    doc.setFontSize(7.5);
    const rowH = 5.8;
    jobFields.forEach(([lbl, val], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const jx = mg + col * (jcW + 4);
      const jy = y + row * rowH;
      doc.setFont('helvetica', 'bold'); doc.text(`${lbl}:`, jx, jy);
      doc.setFont('helvetica', 'normal');
      const maxLen = Math.floor(jcW / 1.8);
      const display = String(val).length > maxLen ? String(val).substring(0, maxLen - 1) + '…' : String(val);
      doc.text(display, jx + 26, jy);
    });

    // Draw image on the right if present
    if (hasImg) {
      const imgX = mg + jobColW + 4;
      try {
        doc.setDrawColor(0); doc.setLineWidth(0.3);
        doc.rect(imgX, y - 1, IMG_W, IMG_H + 2);
        doc.addImage(base64Img, 'JPEG', imgX + 0.5, y - 0.5, IMG_W - 1, IMG_H);
      } catch { /* ignore image draw error */ }
    }

    const jobBlockH = Math.ceil(jobFields.length / 2) * rowH;
    y += Math.max(jobBlockH, hasImg ? IMG_H + 4 : 0) + 3;


    const totalRolls = issuedItems.reduce((s, it) => s + (parseInt(it.qty) || 0), 0);
    const totalWeight = issuedItems.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0);

    doc.setFillColor(240); doc.rect(mg, y, cW, 10, 'F');
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(mg, y, cW, 10);

    const chips = [
      ['TOTAL ROLLS', String(totalRolls)],
      ['TOTAL WEIGHT', `${totalWeight.toFixed(2)} kg`],
      ['BARCODES', String(allBarcodeIds.length)],
      ['LOT NUMBER', lotNo],
      ['DATE', fmtDate],
    ];
    const chipW = cW / chips.length;
    chips.forEach(([lbl, val], i) => {
      const cx = mg + i * chipW + chipW / 2;
      doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
      doc.text(lbl, cx, y + 3.5, { align: 'center' });
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text(val, cx, y + 8.5, { align: 'center' });
    });
    y += 14;

    const rowHt = 5.2;
    const headerHt = 6;

    // Collect all rows
    const allRows = [];
    issuedShadeIds.forEach(shadeId => {
      const shadeObj = allShadesWithIds.find(s => s.id === shadeId);
      const shadeName = shadeObj ? shadeObj.name : shadeId;
      const barcodes = scannedBarcodes[shadeId] || [];
      const locMap = scannedBarcodes[`${shadeId}_location`] || {};
      const wpp = barcodes.length > 0 ? (issueWeight[shadeId] || 0) / barcodes.length : 0;
      
      const itemRecord = issuedItems.find(it => it.id === shadeId);
      const tableNum = itemRecord ? itemRecord.tableNumber : '';
      const tableShort = tableNum.replace('Table ', 'T');
      const shadeDisplay = tableShort ? `${shadeName.substring(0, 8)} (${tableShort})` : shadeName.substring(0, 11);

      barcodes.forEach(bc => {
        allRows.push({
          bc,
          shade: shadeDisplay,
          wt: wpp.toFixed(2),
          loc: barcodeLocationMap[bc] || locMap[bc] || '—',
          lot: lotNo,
        });
      });
    });

    const pageBottom = pH - 18;

    if (allRows.length > 0) {
      // ── Barcode Table ────────────────────────────────────────────────────────
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
      doc.text('ISSUED FABRIC ROLLS', mg, y);
      doc.setTextColor(0);
      y += 1.5; rule(y, 0.3); y += 3;

      // 2-column layout: each column has its own mini-table
      // Columns: # | Barcode | Shade | Wt | Location
      const NUM_COLS = 2;
      const tableW = (cW - 4) / NUM_COLS;  // 4mm gap between cols
      const colDefs = [
        { lbl: '#', w: 7 },
        { lbl: 'Barcode ID', w: 32 },
        { lbl: 'Shade', w: 25 },
        { lbl: 'Wt(kg)', w: 14 },
        { lbl: 'Location', w: tableW - 7 - 32 - 25 - 14 },
      ];

      const drawTableHeader = (startX) => {
        doc.setFillColor(230); doc.setDrawColor(0); doc.setLineWidth(0.25);
        doc.rect(startX, y, tableW, headerHt, 'FD');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
        let cx = startX + 1;
        colDefs.forEach(cd => { doc.text(cd.lbl, cx, y + 4.2); cx += cd.w; });
      };

      // Draw both column headers
      drawTableHeader(mg);
      drawTableHeader(mg + tableW + 4);
      y += headerHt;

      // Split into two halves
      const half = Math.ceil(allRows.length / 2);
      const leftRows = allRows.slice(0, half);
      const rightRows = allRows.slice(half);

      const drawCell = (x, y, row, idx, side) => {
        const isEven = idx % 2 === 0;
        if (isEven) { doc.setFillColor(248); doc.rect(x, y, tableW, rowHt, 'F'); }
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(0);

        const vals = [String(idx + 1 + (side === 'right' ? half : 0)), row.bc, row.shade, row.wt, row.loc];
        let cx = x + 1;
        colDefs.forEach((cd, ci) => {
          if (ci === 4 && row.loc && row.loc !== '—') {
            // Location cell: bold
            doc.setFont('helvetica', 'bold');
            doc.text(vals[ci].substring(0, 10), cx, y + 3.8);
            doc.setFont('helvetica', 'normal');
          } else {
            doc.text(vals[ci].substring(0, Math.floor(cd.w / 1.4)), cx, y + 3.8);
          }
          cx += cd.w;
        });

        // Bottom rule
        doc.setDrawColor(220); doc.setLineWidth(0.1);
        doc.line(x, y + rowHt, x + tableW, y + rowHt);
        doc.setDrawColor(0);
      };

      const maxTableRows = Math.max(leftRows.length, rightRows.length);
      let rowsOnPage = 0;
      let ri = 0;

      while (ri < maxTableRows) {
        // Check if we need a new page
        if (y + rowHt > pageBottom) {
          // Footer on current page
          doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
          doc.text(`TWMS Fabric Issuance · ${fmtDate}`, mg, pH - 8);
          doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pW - mg, pH - 8, { align: 'right' });

          doc.addPage();
          drawPageContent(false);
          y = 20;
          rowsOnPage = 0;

          // Redraw headers on new page
          drawTableHeader(mg);
          drawTableHeader(mg + tableW + 4);
          y += headerHt;
        }

        // Draw left cell
        if (ri < leftRows.length) drawCell(mg, y, leftRows[ri], ri, 'left');
        // Draw right cell
        if (ri < rightRows.length) drawCell(mg + tableW + 4, y, rightRows[ri], ri, 'right');

        // Vertical divider between columns
        doc.setDrawColor(200); doc.setLineWidth(0.15);
        doc.line(mg + tableW + 2, y, mg + tableW + 2, y + rowHt);
        doc.setDrawColor(0);

        y += rowHt;
        ri++;
        rowsOnPage++;
      }

      // ── Footer totals bar ──────────────────────────────────────────────────
      y += 2;
      doc.setDrawColor(0); doc.setLineWidth(0.4);
      doc.setFillColor(230); doc.rect(mg, y, cW, 7, 'FD');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text(
        `TOTAL: ${totalRolls} roll(s)   ${totalWeight.toFixed(2)} kg   ${allBarcodeIds.length} barcode(s)   Lot: ${lotNo}`,
        mg + 3, y + 5
      );
    }

    // ── Kharcha items in PDF ──────────────────────────────────────────────
    const validKharcha = kharchaItems ? kharchaItems.filter(k => k.item.trim() !== '' || k.weight !== '') : [];
    if (validKharcha.length > 0) {
      y += 12;
      if (y + 15 > pageBottom) {
        doc.addPage();
        drawPageContent(false);
        y = 20;
      }
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
      doc.text('ISSUED KHARCHA (ACCESSORIES / EXPENSE)', mg, y);
      doc.setTextColor(0);
      y += 1.5;
      rule(y, 0.3);
      y += 3;

      // Draw table header
      doc.setFillColor(230); doc.setDrawColor(0); doc.setLineWidth(0.25);
      doc.rect(mg, y, cW, headerHt, 'FD');
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text('#', mg + 2, y + 4.2);
      doc.text('Item Name', mg + 15, y + 4.2);
      doc.text('Weight (kg)', mg + 120, y + 4.2);
      y += headerHt;

      validKharcha.forEach((kh, kIdx) => {
        if (y + rowHt > pageBottom) {
          doc.addPage();
          drawPageContent(false);
          y = 20;
          // Redraw header
          doc.setFillColor(230); doc.setDrawColor(0); doc.setLineWidth(0.25);
          doc.rect(mg, y, cW, headerHt, 'FD');
          doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
          doc.text('#', mg + 2, y + 4.2);
          doc.text('Item Name', mg + 15, y + 4.2);
          doc.text('Weight (kg)', mg + 120, y + 4.2);
          y += headerHt;
        }

        const isEven = kIdx % 2 === 0;
        if (isEven) { doc.setFillColor(248); doc.rect(mg, y, cW, rowHt, 'F'); }
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
        doc.text(String(kIdx + 1), mg + 2, y + 3.8);
        doc.text(kh.item, mg + 15, y + 3.8);
        doc.text(`${parseFloat(kh.weight || 0).toFixed(2)} kg`, mg + 120, y + 3.8);

        doc.setDrawColor(220); doc.setLineWidth(0.1);
        doc.line(mg, y + rowHt, mg + cW, y + rowHt);
        doc.setDrawColor(0);
        y += rowHt;
      });
    }

    // ── Page footer on all pages ────────────────────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
      doc.text(`TWMS Fabric Issuance Report · ${fmtDate} · Issued by: ${issuedBy}`, mg, pH - 8);
      doc.text(`Page ${p} of ${totalPages}`, pW - mg, pH - 8, { align: 'right' });
      // Outer border bottom line
      doc.setDrawColor(0); doc.setLineWidth(0.6);
      doc.line(mg - 2, pH - 6, mg + cW + 2, pH - 6);
    }

    const fileName = `FabricIssuance_${lotNo}_${now.toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  };


  const handleIssueFabric = async () => {
    if (!selectedJob) return;

    const issuedShadeIds = Object.keys(issueQuantity).filter(shadeId => issueQuantity[shadeId] > 0);
    if (issuedShadeIds.length === 0) {
      alert('Please scan at least one roll to issue');
      return;
    }

    const allShadesWithIds = getShadesWithIds(selectedJob['Shade']);

    // Validate that table numbers are selected for all issued shades
    for (const shadeId of issuedShadeIds) {
      if (!shadeTableNumbers[shadeId]) {
        const shadeObj = allShadesWithIds.find(s => s.id === shadeId);
        const shadeName = shadeObj ? shadeObj.name : shadeId;
        alert(`❌ Please select a Table Number for shade: ${shadeName}`);
        return;
      }
    }

    setIsSubmitting(true);

    // Build per-barcode location map for PDF
    const barcodeLocationMap = {};
    issuedShadeIds.forEach(shadeId => {
      const barcodes = scannedBarcodes[shadeId] || [];
      const locationMap = scannedBarcodes[`${shadeId}_location`] || {};
      barcodes.forEach(bc => {
        barcodeLocationMap[bc] = locationMap[bc] || '';
      });
    });

    const issuedItems = issuedShadeIds.map(shadeId => {
      const shadeObj = allShadesWithIds.find(s => s.id === shadeId);
      return {
        id: shadeId,
        shade: shadeObj ? shadeObj.name : shadeId,
        shadeEntry: shadeObj ? shadeObj.originalIndex + 1 : 1,
        qty: issueQuantity[shadeId],
        weight: issueWeight[shadeId] || 0,
        barcodeIds: scannedBarcodes[shadeId] || [],
        tableNumber: shadeTableNumbers[shadeId] || ''
      };
    });

    const totalQuantity = issuedShadeIds.reduce((sum, shadeId) => sum + issueQuantity[shadeId], 0);
    const totalWeight = issuedShadeIds.reduce((sum, shadeId) => sum + (issueWeight[shadeId] || 0), 0);
    const allBarcodeIds = issuedShadeIds.flatMap(shadeId => scannedBarcodes[shadeId] || []);

    const approvalsList = allBarcodeIds
      .map(id => fabricApprovals[id])
      .filter(Boolean);

    const validKharchaItems = kharchaItems.filter(item => item.item.trim() !== '' || item.weight !== '');

    const issuanceRecord = {
      lotNumber: selectedJob['Lot Number'],
      jobOrderNo: selectedJob['Job Order No'],
      fabric: selectedJob['Fabric'],
      brand: selectedJob['Brand'],
      issuedItems: issuedItems,
      totalQuantity: totalQuantity,
      totalWeight: totalWeight,
      issuedBy: getDisplayName(),
      department: loggedInUser?.department || 'Production',
      issuedAt: new Date().toISOString(),
      status: 'completed',
      barcodeIds: allBarcodeIds,
      remarks: `Issued ${issuedShadeIds.length} shade types, Total ${totalQuantity} rolls. Barcodes: ${allBarcodeIds.join(', ')}`,
      jobDetails: selectedJob,
      fabricChangeApprovals: approvalsList,
      kharchaItems: validKharchaItems,
      barcodeWeights: scannedBarcodeWeights,
      matchingStatus: lotMatchingStatus || null,
      matchingPassedBy: matchingPassedBy || null,
      specialApproval: specialApprovalData || null,
      specialApprovedBy: specialApprovalData?.approvedBy || null
    };

    console.log('📦 Issuance Record with Barcodes:', issuanceRecord);

    const result = await storeIssuanceInGoogleSheets(issuanceRecord);

    if (result.success) {
      // --- Generate and download PDF report (Removed while submitting by user request) ---
      /*
      try {
        await exportFabricIssuancePdf({
          selectedJob,
          issuedItems,
          allBarcodeIds,
          barcodeLocationMap,
          scannedBarcodes,
          issuedShadeIds,
          allShadesWithIds,
          issuedBy: getDisplayName(),
          issuanceId: result.data?.issuanceId,
          kharchaItems: validKharchaItems
        });
      } catch (pdfErr) {
        console.error('PDF generation error:', pdfErr);
      }
      */

      const updatedGlobalSet = new Set(globalIssuedBarcodes);
      allBarcodeIds.forEach(id => updatedGlobalSet.add(id));
      setGlobalIssuedBarcodes(updatedGlobalSet);

      localStorage.setItem('globalIssuedBarcodes', JSON.stringify(Array.from(updatedGlobalSet)));
      localStorage.setItem('globalIssuedBarcodesLastUpdated', new Date().toISOString());

      setDuplicateCheckCache({});

      const newIssueRecord = {
        id: Date.now(),
        issuanceId: result.data?.issuanceId,
        ...issuanceRecord,
        items: issuedItems
      };

      // Add to history (prepend, not append for reverse chronological)
      const updatedHistory = [newIssueRecord, ...issueHistory];
      setIssueHistory(updatedHistory);
      localStorage.setItem(`fabric_issue_${selectedJob['Lot Number']}`, JSON.stringify(updatedHistory));

      // Consume special approval permission if one was active for this table/lot
      if (specialApprovalData?.tableNo || defaultTable) {
        store.consumeApprovalRequest({
          tableNo: specialApprovalData?.tableNo || defaultTable,
          lotNumber: selectedJob['Lot Number']
        }).catch(err => console.error('Error consuming approval request:', err));
      }

      setSpecialApprovalData(null);
      setPendingApprovalReqId(null);
      fetchApprovalRequests();
      fetchTableClassification();

      alert(`✅ Issued Successfully!\n\n📦 Total Rolls: ${totalQuantity}\n⚖️ Total Weight: ${totalWeight.toFixed(2)} kg\n🏷️ Barcodes: ${allBarcodeIds.length} scanned\n✓ Data saved to Google Sheets`);

      setIssueQuantity({});
      setIssueWeight({});
      setScannedRoll(null);
      setSelectedShades({});
      setScannedBarcodes({});
      setScannedBarcodeWeights({});
      setFabricApprovals({});
      setDefaultApproverName('');
      setMatchingPassedBy('');
      setShadeTableNumbers({});
      setKharchaItems([{ id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
      setNoKharcha(false);

      // Reset pagination and reload history
      setHistoryPage(1);
      setHasMoreHistory(true);
      loadIssueHistoryPaginated(selectedJob['Lot Number'], 1, true);
    } else {
      const offlineRecord = {
        ...issuanceRecord,
        offlineSavedAt: new Date().toISOString()
      };

      const offlineData = JSON.parse(localStorage.getItem('offlineFabricIssuances') || '[]');
      offlineData.push(offlineRecord);
      localStorage.setItem('offlineFabricIssuances', JSON.stringify(offlineData));

      const updatedGlobalSet = new Set(globalIssuedBarcodes);
      allBarcodeIds.forEach(id => updatedGlobalSet.add(id));
      setGlobalIssuedBarcodes(updatedGlobalSet);
      localStorage.setItem('globalIssuedBarcodes', JSON.stringify(Array.from(updatedGlobalSet)));

      alert(`⚠️ Issuance recorded but saved offline.\n\n📦 Total Rolls: ${totalQuantity}\n⚖️ Total Weight: ${totalWeight.toFixed(2)} kg\n🏷️ Barcodes: ${allBarcodeIds.length} scanned\n\nData will sync when connection is restored.`);

      const newIssueRecord = {
        id: Date.now(),
        ...issuanceRecord,
        offline: true
      };

      const updatedHistory = [newIssueRecord, ...issueHistory];
      setIssueHistory(updatedHistory);
      localStorage.setItem(`fabric_issue_${selectedJob['Lot Number']}`, JSON.stringify(updatedHistory));

      setIssueQuantity({});
      setIssueWeight({});
      setScannedRoll(null);
      setSelectedShades({});
      setScannedBarcodes({});
      setScannedBarcodeWeights({});
      setFabricApprovals({});
      setDefaultApproverName('');
      setMatchingPassedBy('');
      setShadeTableNumbers({});
      setKharchaItems([{ id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
      setNoKharcha(false);
    }

    setIsSubmitting(false);
  };

  const handleIssueKharcha = async () => {
    if (!selectedJob) return;

    let validKharchaItems = [];
    if (noKharcha) {
      validKharchaItems = [{
        item: 'No Kharcha',
        weight: '0',
        shade: 'N/A',
        mode: 'manual',
        barcodes: []
      }];
    } else {
      validKharchaItems = kharchaItems.filter(item => item.item.trim() !== '' || item.weight !== '');
      if (validKharchaItems.length === 0) {
        alert('Please fill in at least one Kharcha item with Name or Weight, or check "No Kharcha"');
        return;
      }
    }

    setIsSubmitting(true);

    const formattedKharcha = validKharchaItems.map(k => ({
      item: k.item,
      weight: k.weight,
      shade: k.shade,
      mode: k.mode || 'manual',
      barcodes: k.barcodes?.map(b => b.barcodeId) || []
    }));

    const remarksText = noKharcha ? `Issued Kharcha: No Kharcha for this lot` : `Issued Kharcha: ${formattedKharcha.map(k => {
      const barcodeStr = k.barcodes.length > 0 ? ` [Barcodes: ${k.barcodes.join(', ')}]` : '';
      return `${k.item}${k.shade ? ` for shade ${k.shade}` : ''} (${k.weight} kg)${barcodeStr}`;
    }).join(', ')}`;

    const issuanceRecord = {
      lotNumber: selectedJob['Lot Number'],
      jobOrderNo: selectedJob['Job Order No'],
      fabric: selectedJob['Fabric'],
      brand: selectedJob['Brand'],
      issuedItems: [],
      totalQuantity: 0,
      totalWeight: 0,
      issuedBy: getDisplayName(),
      department: loggedInUser?.department || 'Production',
      issuedAt: new Date().toISOString(),
      status: 'completed',
      barcodeIds: formattedKharcha.flatMap(k => k.barcodes),
      remarks: remarksText,
      jobDetails: selectedJob,
      fabricChangeApprovals: [],
      kharchaItems: formattedKharcha
    };

    console.log('📦 Issuance Record for Kharcha:', issuanceRecord);

    const result = await storeIssuanceInGoogleSheets(issuanceRecord);

    if (result.success) {
      // --- Generate and download PDF report for Kharcha (Removed while submitting by user request) ---
      /*
      try {
        await exportFabricIssuancePdf({
          selectedJob,
          issuedItems: [],
          allBarcodeIds: [],
          barcodeLocationMap: {},
          scannedBarcodes: {},
          issuedShadeIds: [],
          allShadesWithIds: [],
          issuedBy: getDisplayName(),
          issuanceId: result.data?.issuanceId,
          kharchaItems: validKharchaItems
        });
      } catch (pdfErr) {
        console.error('PDF generation error:', pdfErr);
      }
      */

      const newIssueRecord = {
        id: Date.now(),
        issuanceId: result.data?.issuanceId,
        ...issuanceRecord,
        items: []
      };

      // Add to history (prepend)
      const updatedHistory = [newIssueRecord, ...issueHistory];
      setIssueHistory(updatedHistory);
      localStorage.setItem(`fabric_issue_${selectedJob['Lot Number']}`, JSON.stringify(updatedHistory));

      alert(`✅ Kharcha Issued Successfully!\n\n💰 Stored ${validKharchaItems.length} accessories/expense item(s) to Google Sheets`);
      setKharchaItems([{ id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
      setNoKharcha(false);

      // Reset pagination and reload history
      setHistoryPage(1);
      setHasMoreHistory(true);
      loadIssueHistoryPaginated(selectedJob['Lot Number'], 1, true);
    } else {
      const offlineRecord = {
        ...issuanceRecord,
        offlineSavedAt: new Date().toISOString()
      };

      const offlineData = JSON.parse(localStorage.getItem('offlineFabricIssuances') || '[]');
      offlineData.push(offlineRecord);
      localStorage.setItem('offlineFabricIssuances', JSON.stringify(offlineData));

      alert(`⚠️ Kharcha recorded but saved offline.\n\nData will sync when connection is restored.`);

      const newIssueRecord = {
        id: Date.now(),
        ...issuanceRecord,
        offline: true
      };

      const updatedHistory = [newIssueRecord, ...issueHistory];
      setIssueHistory(updatedHistory);
      localStorage.setItem(`fabric_issue_${selectedJob['Lot Number']}`, JSON.stringify(updatedHistory));

      setKharchaItems([{ id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
      setNoKharcha(false);
    }

    setIsSubmitting(false);
  };

  const getTotalIssuedQuantity = () => {
    return issueHistory.reduce((sum, record) => sum + (parseInt(record.totalQuantity || record.totalQty) || 0), 0);
  };

  const getTotalIssuedWeight = () => {
    return issueHistory.reduce((sum, record) => sum + (parseFloat(record.totalWeight) || 0), 0);
  };

  const getShadeColor = (shade) => {
    const colors = {
      'BLACK': '#1a1a1a',
      'WHITE': '#ffffff',
      'OFF-WHITE': '#f5f5dc',
      'OLIVE': '#556b2f',
      'NAVY': '#000080',
      'NAVY BLUE': '#000080',
      'GREY': '#808080',
      'GRAY': '#808080',
      'RFD': '#ff6b6b',
      'RED': '#ff0000',
      'BLUE': '#0000ff',
      'GREEN': '#008000'
    };
    return colors[shade.toUpperCase()] || '#2a5298';
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  useEffect(() => {
    const handleOnline = () => {
      syncOfflineIssuances();
      fetchAllIssuedBarcodes();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const currentSelectedShade = getCurrentSelectedShade();

  // Non-blocking UI: do not block full page with blank screen when loading

  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon">⚠️</div>
        <h3>Unable to Load Data</h3>
        <p>{error}</p>
        <button onClick={fetchSheetData} className="retry-btn">
          🔄 Try Again
        </button>
      </div>
    );
  }

  if (!eligibilityChecked) {
    return (
      <div className="eligibility-portal-root" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg, #f8fafc)',
        color: 'var(--text-primary, #0f172a)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '30px 40px',
        boxSizing: 'border-box'
      }}>
        <style>{`
          .eligibility-portal-root {
            background-color: var(--bg, #f8fafc);
            color: var(--text-primary, #0f172a);
          }
          .dark .eligibility-portal-root {
            background-color: #0b132b !important;
            color: #f8fafc !important;
          }

          .table-card {
            background: var(--surface, #ffffff);
            border: 1px solid var(--border, #cbd5e1);
            border-radius: 12px;
            padding: 16px 20px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 110px;
            box-sizing: border-box;
          }
          .table-card:hover {
            border-color: #2563eb;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.08);
          }
          .dark .table-card {
            background: #1e293b !important;
            border-color: #334155 !important;
            color: #f8fafc !important;
          }
          .dark .table-card:hover {
            border-color: #3b82f6 !important;
            box-shadow: 0 6px 20px rgba(0,0,0,0.3) !important;
          }

          .table-card.locked {
            background-color: #fef2f2;
            border: 2px solid #ef4444;
          }
          .dark .table-card.locked {
            background-color: rgba(239, 68, 68, 0.12) !important;
            border: 2px solid #ef4444 !important;
          }

          .table-card.eligible {
            background-color: var(--surface, #ffffff);
            border: 1px solid var(--border, #cbd5e1);
          }

          .table-card.has-one {
            background-color: #fffbeb;
            border: 1.5px solid #f59e0b;
          }
          .dark .table-card.has-one {
            background-color: rgba(245, 158, 11, 0.12) !important;
            border: 1.5px solid #f59e0b !important;
          }

          .table-card.approved-unlocked {
            background-color: #f0fdf4;
            border: 2px solid #10b981;
          }
          .dark .table-card.approved-unlocked {
            background-color: rgba(16, 185, 129, 0.12) !important;
            border: 2px solid #10b981 !important;
          }

          .table-card.approved-unlocked:hover {
            border-color: #059669;
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.2);
          }

          .portal-top-border {
            border-bottom: 2px solid #0f172a;
          }
          .dark .portal-top-border {
            border-bottom-color: #334155 !important;
          }

          .portal-title-text {
            color: #0f172a;
          }
          .dark .portal-title-text {
            color: #f8fafc !important;
          }

          .portal-sub-text {
            color: #475569;
          }
          .dark .portal-sub-text {
            color: #94a3b8 !important;
          }

          .portal-search-box {
            background: #ffffff;
            border: 2px solid #0f172a;
          }
          .dark .portal-search-box {
            background: #1e293b !important;
            border-color: #334155 !important;
          }

          .portal-search-input {
            background: transparent;
            color: #0f172a;
          }
          .dark .portal-search-input {
            color: #f8fafc !important;
          }

          .portal-refresh-btn {
            background: #ffffff;
            color: #0f172a;
            border: 2px solid #0f172a;
          }
          .dark .portal-refresh-btn {
            background: #1e293b !important;
            color: #f8fafc !important;
            border-color: #334155 !important;
          }

          .portal-exit-btn {
            background: #0f172a;
            color: #ffffff;
          }
          .dark .portal-exit-btn {
            background: #2563eb !important;
            color: #ffffff !important;
          }

          .table-card-title {
            color: #0f172a;
          }
          .dark .table-card-title {
            color: #f8fafc !important;
          }

          .table-card-lots {
            color: #0f172a;
          }
          .dark .table-card-lots {
            color: #cbd5e1 !important;
          }

          .table-card-staff {
            border-top: 1px solid #cbd5e1;
            color: #475569;
          }
          .dark .table-card-staff {
            border-top-color: #334155 !important;
            color: #94a3b8 !important;
          }
          .dark .table-card-staff span {
            color: #f8fafc !important;
          }

          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        `}</style>

        {/* Top Header */}
        <div className="portal-top-border" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          marginBottom: '24px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 className="portal-title-text" style={{ fontSize: '28px', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                Verify Issuance Eligibility
              </h1>
              {loadingEligibility && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                    animation: 'pulse 1.2s infinite'
                  }}></span>
                  Syncing Table Queue...
                </span>
              )}
            </div>
            <p className="portal-sub-text" style={{ fontSize: '13px', margin: '4px 0 0 0', fontWeight: '500' }}>
              Select an active cutting table. Tables with 2 or more uncut lots are locked in the frontend to avoid overloading.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="portal-search-box" style={{ display: 'flex', alignItems: 'center', borderRadius: '8px', overflow: 'hidden' }}>
              <input
                type="text"
                placeholder="OPEN ISSUED LOT..."
                value={openIssuedLotNo}
                onChange={e => setOpenIssuedLotNo(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleOpenIssuedLot(openIssuedLotNo)}
                className="portal-search-input"
                style={{
                  border: 'none',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: '700',
                  outline: 'none',
                  textTransform: 'uppercase',
                  width: '180px'
                }}
              />
              <button
                onClick={() => handleOpenIssuedLot(openIssuedLotNo)}
                style={{
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  padding: '10px 16px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                🔍 OPEN
              </button>
            </div>
            <button
              onClick={() => {
                fetchTableClassification();
                fetchApprovalRequests();
              }}
              disabled={loadingEligibility}
              className="portal-refresh-btn"
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: loadingEligibility ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: loadingEligibility ? 0.7 : 1
              }}
            >
              🔄 Refresh Tables
            </button>
            <button
              onClick={() => window.history.back()}
              className="portal-exit-btn"
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '13px',
                textTransform: 'uppercase'
              }}
            >
              ← Exit Portal
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(loadingEligibility && tableClassificationData.length === 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '65%', textAlign: 'center', padding: '30px' }}>
              <div style={{
                width: '54px',
                height: '54px',
                border: '5px solid #e2e8f0',
                borderTop: '5px solid #2563eb',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginBottom: '20px'
              }}></div>
              <h3 className="portal-title-text" style={{ fontSize: '18px', fontWeight: '800', margin: '0 0 8px 0' }}>
                ⏳ Processing Table Queues & Admin Approvals...
              </h3>
              <p className="portal-sub-text" style={{ fontSize: '13px', margin: 0, maxWidth: '440px', lineHeight: '1.5', fontWeight: '500' }}>
                Fetching active uncut lot assignments and synchronizing table permissions with backend database...
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '20px',
              paddingBottom: '20px'
            }}>
              {displayedTables.map(t => {
                const classification = tableClassificationData.find(
                  item => item.tableNumber.trim().toLowerCase() === t.name.trim().toLowerCase()
                );
                
                const activeLots = classification?.lots || [];
                const lotsCount = activeLots.length;
                const approvedReq = getApprovedRequestForTable(t.name);
                const isApproved = Boolean(approvedReq);
                const isLocked = lotsCount >= 2 && !isApproved && loggedInUser?.role !== 'Admin';

                let statusBadgeText = 'VACANT';
                let statusBadgeColor = '#10b981';
                let cardClass = 'table-card eligible';

                if (isApproved) {
                  statusBadgeText = `UNLOCKED (${(approvedReq?.respondedBy || 'ADMIN').toUpperCase()})`;
                  statusBadgeColor = '#059669';
                  cardClass = 'table-card approved-unlocked';
                } else if (lotsCount === 1) {
                  statusBadgeText = '1 LOT ACTIVE';
                  statusBadgeColor = '#d97706';
                  cardClass = 'table-card has-one';
                } else if (isLocked) {
                  statusBadgeText = 'FULL / LOCKED';
                  statusBadgeColor = '#ef4444';
                  cardClass = 'table-card locked';
                }

                return (
                  <div
                    key={t.id}
                    className={cardClass}
                    onClick={() => handleSelectTable(t.name)}
                  >
                    <div>
                      {/* Name & Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="table-card-title" style={{ fontSize: '18px', fontWeight: '900' }}>
                          {t.name.toUpperCase()}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: '800',
                          color: statusBadgeColor,
                          letterSpacing: '0.5px'
                        }}>
                          ● {statusBadgeText}
                        </span>
                      </div>

                      {/* Lots */}
                      <div className="table-card-lots" style={{ fontSize: '12px', fontWeight: '700', marginBottom: '12px' }}>
                        {lotsCount > 0 ? (
                          <span>Lots: {activeLots.map(l => l.lotNumber).join(', ')}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontWeight: '500', fontStyle: 'italic' }}>No pending cuts</span>
                        )}
                      </div>

                      {isApproved && (
                        <div style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          color: '#15803d',
                          backgroundColor: '#dcfce7',
                          border: '1px solid #86efac',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          marginBottom: '8px'
                        }}>
                          🔓 Approved by {approvedReq?.respondedBy || 'Admin'}
                        </div>
                      )}
                    </div>

                    {/* Staff */}
                    <div className="table-card-staff" style={{
                      paddingTop: '8px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        SUP: <span>{(t.Supervisor?.name || 'NONE').toUpperCase()}</span>
                      </div>
                      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        CUT: <span>{(t.CutterMaster?.name || 'NONE').toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Special Approval Modal for Locked Tables / Eligibility Override */}
        {specialApprovalModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              boxSizing: 'border-box'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '28px' }}>🔐</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
                    Send Admin Approval Request
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                    Eligibility Override Permission for {specialApprovalModal.tableNo}
                  </p>
                </div>
              </div>

              <div style={{
                backgroundColor: '#fef2f2',
                borderLeft: '4px solid #ef4444',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '13px',
                color: '#991b1b',
                lineHeight: '1.5'
              }}>
                <strong>⚠️ Table Capacity Locked:</strong> {specialApprovalModal.tableNo} currently has {specialApprovalModal.lotsCount} active lots pending cutting:
                <div style={{ fontWeight: '700', marginTop: '4px', color: '#7f1d1d' }}>
                  Active Lots: {specialApprovalModal.lotNumbers}
                </div>
                Sending an approval request will notify the Admin Panel to ALLOW or REJECT issuance against this table.
              </div>

              {pendingApprovalReqId ? (
                <div style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  backgroundColor: '#f0f9ff',
                  border: '2px dashed #0284c7',
                  borderRadius: '12px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    border: '4px solid #e0f2fe',
                    borderTop: '4px solid #0284c7',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 12px auto'
                  }}></div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '800', color: '#0369a1' }}>
                    ⏳ Approval Request Sent to Admin Panel
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px', color: '#0284c7', lineHeight: '1.4' }}>
                    Notification is active for Admin review. Once an Admin clicks <strong>ALLOW</strong> in the Admin Panel / Topbar, this page will automatically unlock and allow issuing weight.
                  </p>
                  <button
                    onClick={() => setPendingApprovalReqId(null)}
                    style={{
                      marginTop: '16px',
                      padding: '6px 14px',
                      backgroundColor: '#e0f2fe',
                      color: '#0369a1',
                      border: '1px solid #7dd3fc',
                      borderRadius: '6px',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel Request
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                      Requester / Person Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter your name / supervisor name..."
                      value={specialApproverName}
                      onChange={(e) => setSpecialApproverName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '14px',
                        borderRadius: '8px',
                        border: '2px solid #cbd5e1',
                        outline: 'none',
                        fontWeight: '600',
                        boxSizing: 'border-box'
                      }}
                      autoFocus
                    />
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                      Reason for Special Issuance (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Urgent rush order, supervisor override..."
                      value={specialApprovalReason}
                      onChange={(e) => setSpecialApprovalReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '14px',
                        borderRadius: '8px',
                        border: '2px solid #cbd5e1',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setSpecialApprovalModal(null)}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Close
                </button>
                {!pendingApprovalReqId && (
                  <button
                    onClick={handleRequestAdminApproval}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      fontSize: '13px',
                      boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)'
                    }}
                  >
                    🚀 Send Request to Admin Panel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fabric-issued-container">

      <div className="hero-section">
        <div className="hero-content hero-content--compact">

          {/* Left: Back button */}
          <button
            onClick={() => {
              if (eligibilityChecked) {
                setEligibilityChecked(false);
                setSelectedJob(null);
                setEligibilityLot('');
                setEligibilityError(null);
              } else {
                window.history.back();
              }
            }}
            className="hero-back-btn"
          >
            ← Back
          </button>

          {/* Center: Title */}
          <div className="hero-title-group">
            <h1>Fabric Issuance Portal</h1>
            <p>Issue fabric against job orders</p>
          </div>

          {/* Right: Search (only when no job selected) */}
          {!selectedJob ? (
            <div className="hero-search hero-search--inline">
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Enter Lot Number..."
                  value={searchLot}
                  onChange={(e) => setSearchLot(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="hero-input"
                />
              </div>
              <button 
                onClick={handleSearch} 
                disabled={loading} 
                className="hero-button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading && <span className="search-spinner" style={{ width: '14px', height: '14px', borderTopColor: '#5f3dc4' }} />}
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button onClick={fetchSheetData} disabled={loading} className="hero-button secondary">
                🔄
              </button>
            </div>
          ) : (
            <div className="hero-lot-badge">
              <span style={{ fontSize: '11px', opacity: 0.75 }}>Current Lot</span>
              <span style={{ fontSize: '16px', fontWeight: '800', letterSpacing: '0.5px' }}>{selectedJob['Lot Number']}</span>
            </div>
          )}

        </div>
      </div>

      {selectedJob ? (
        <div className="dashboard">

          {/* ── Special Permission Approval Banner ─────────────────────── */}
          {specialApprovalData && (
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1.5px solid #86efac',
              borderRadius: '12px',
              padding: '14px 20px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🔓</span>
                <div>
                  <div style={{ fontWeight: '800', color: '#166534', fontSize: '15px' }}>
                    Special Permission Granted by: {specialApprovalData.approvedBy}
                  </div>
                  <div style={{ fontSize: '12px', color: '#15803d', marginTop: '2px', fontWeight: '500' }}>
                    Table: <strong>{specialApprovalData.tableNo}</strong> | Reason: {specialApprovalData.reason || 'Eligibility Criteria Override'}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '11px',
                fontWeight: '800',
                backgroundColor: '#dcfce7',
                color: '#15803d',
                padding: '6px 12px',
                borderRadius: '20px',
                border: '1px solid #86efac',
                letterSpacing: '0.5px'
              }}>
                SPECIAL PERMISSION GRANTED
              </span>
            </div>
          )}

          {/* ── Global Matching Status Banner ─────────────────────────── */}
          {lotMatchingStatus ? (
            <div style={{
              borderRadius: '14px',
              marginBottom: '18px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '16px 22px',
                background:
                  lotMatchingStatus === 'no_matching' ? 'linear-gradient(135deg,#059669,#10b981)'
                    : lotMatchingStatus === 'passed' ? 'linear-gradient(135deg,#1d4ed8,#3b82f6)'
                      : 'linear-gradient(135deg,#dc2626,#ef4444)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '28px' }}>
                    {lotMatchingStatus === 'no_matching' ? '✅'
                      : lotMatchingStatus === 'passed' ? '🔵'
                        : '❌'}
                  </span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      Matching Status — Lot {selectedJob['Lot Number']}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff', marginTop: '2px' }}>
                      {lotMatchingStatus === 'no_matching' ? 'No Matching Required — Scanning Allowed'
                        : lotMatchingStatus === 'passed' ? `Matching Passed ✔ — Scanning Allowed (Approved by: ${matchingPassedBy})`
                          : 'Matching Failed ✘ — Scanning Blocked'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setMatchingModal({ step: 'ask_matching' })}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
                  onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                >
                  🔄 Re-check Matching
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              borderRadius: '14px',
              marginBottom: '18px',
              padding: '14px 22px',
              background: 'rgba(150,150,150,0.08)',
              border: '1px dashed rgba(150,150,150,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>⬜</span>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', letterSpacing: '1px', textTransform: 'uppercase' }}>Matching Status</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#bbb', marginTop: '2px' }}>Not Checked — Complete matching check to enable scanning</div>
                </div>
              </div>
              <button
                onClick={() => setMatchingModal({ step: 'ask_matching' })}
                style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '700',
                  background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(59,130,246,0.35)'
                }}
              >
                🔍 Start Matching Check
              </button>
            </div>
          )}

          {/* Previously Issued Summary Panel */}
          {issueHistory.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #5f3dc4 0%, #0b7285 100%)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
              color: 'white',
              boxShadow: '0 4px 15px rgba(95, 61, 196, 0.15)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>📊 Previously Issued Summary for Lot {selectedJob['Lot Number']}</h3>
                <div style={{ fontSize: '14px', background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '8px' }}>
                  Total Issued: {getTotalIssuedWeight().toFixed(2)} kg
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
                {getShadesWithIds(selectedJob['Shade']).map((shadeObj) => {
                  const shadeName = shadeObj.name;
                  const shadeEntryNum = shadeObj.originalIndex + 1;

                  const previouslyIssued = getTotalIssuedWeightForShade(shadeName, shadeEntryNum);
                  const wasPreviouslyIssued = previouslyIssued.totalRolls > 0;

                  if (!wasPreviouslyIssued) return null;

                  return (
                    <div key={`prev-${shadeObj.id}`} style={{
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      padding: '12px',
                      border: '1px solid rgba(255,255,255,0.2)'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                        {shadeName} {getShadesWithIds(selectedJob['Shade']).filter(s => normalizeShadeName(s.name) === normalizeShadeName(shadeName)).length > 1 && `(Entry ${shadeEntryNum})`}
                      </div>
                      <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                        📦 Rolls: <strong>{previouslyIssued.totalRolls}</strong> | ⚖️ Weight: <strong>{previouslyIssued.totalWeight.toFixed(2)} kg</strong>
                      </div>
                      {previouslyIssued.allBarcodes.length > 0 && (
                        <details>
                          <summary style={{ fontSize: '11px', cursor: 'pointer', opacity: 0.8 }}>
                            🏷️ Barcodes ({previouslyIssued.allBarcodes.length})
                          </summary>
                          <div style={{ marginTop: '5px', fontSize: '10px', maxHeight: '60px', overflowY: 'auto' }}>
                            {previouslyIssued.allBarcodes.map((barcode, idx) => (
                              <div key={idx} style={{ fontFamily: 'monospace' }}>{barcode}</div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action & Search Bar */}
          <div className="top-bar-container">
            <div className="top-search-group">
              <div className="top-search-wrapper">
                <span className="top-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Enter Lot Number (e.g., 11028)"
                  value={searchLot}
                  onChange={(e) => setSearchLot(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="top-search-input"
                />
              </div>
              <button 
                onClick={handleSearch} 
                disabled={loading} 
                className="top-search-btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', opacity: loading ? 0.8 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading && <span className="search-spinner" style={{ width: '14px', height: '14px' }} />}
                {loading ? 'Searching Lot...' : 'Search Lot'}
              </button>
              <button onClick={fetchSheetData} disabled={loading} className="top-refresh-btn">
                Refresh Data
              </button>
            </div>
            <button
              onClick={() => setShowReceiving(true)}
              className="top-receiving-btn"
            >
              <span style={{ fontSize: '18px' }}>📥</span>
              Receive Returned Fabric
            </button>
          </div>

          {/* Barcode Scanner Section */}
          <div className="scanner-section-modern">
            <div className="scanner-header-modern">
              <div className="scanner-title">
                <span className="scanner-icon">📷</span>
                <h3>Barcode Scanner</h3>
              </div>
              <div className="scanner-stats">
                <div className="stat-badge-sm">
                  <span>Total Scanned Rolls:</span>
                  <strong>{Object.values(issueQuantity).reduce((a, b) => a + b, 0)}</strong>
                </div>
              </div>
            </div>
            <div className="scanner-grid-split">
              {/* Left Panel: Scanner (Auto-adds to transaction) */}
              <div className="scanner-box-panel">
                <h4>📷 Scanner (Auto-adds to transaction)</h4>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={handleBarcodeChange}
                  onKeyPress={handleKeyPress}
                  placeholder="Scan barcode to issue... (Format: BarcodeID|Weight)"
                  className="scanner-input-modern"
                  autoFocus
                  disabled={isSubmitting}
                />
                <div className="scanner-hint-modern">
                  <span>💡 Tip: Scan barcode in format <strong>BarcodeID|Weight</strong> (e.g., 181200|15.75)</span>
                  <span>🔒 System verifies fabric type & shade match (ignores [1], [2] suffixes)</span>
                  <span>🎨 Each shade entry is treated separately</span>
                  <span>⚠️ <strong>Global Tracking:</strong> Barcodes cannot be re-used across ANY lot</span>
                  <span>✨ <strong>Auto-focus:</strong> Input automatically focuses when shade is selected</span>
                </div>
              </div>

              {/* Right Panel: Search (Query roll details without issuing) */}
              <div className="scanner-box-panel">
                <h4>🔍 Quick Barcode Search (Inspect roll details)</h4>
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    value={searchBarcodeInput}
                    onChange={(e) => setSearchBarcodeInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleBarcodeSearch(searchBarcodeInput)}
                    placeholder="Type barcode ID here and press Enter..."
                    className="scanner-input-modern"
                  />
                  <button
                    onClick={() => handleBarcodeSearch(searchBarcodeInput)}
                    className="search-barcode-btn"
                    disabled={isSearchingRoll}
                  >
                    {isSearchingRoll ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {searchRollError && (
                  <div className="searched-roll-card error">
                    ❌ {searchRollError}
                  </div>
                )}

                {searchedRoll && (
                  <div className="searched-roll-card success">
                    <div className="searched-roll-header">
                      <strong>🏷️ Barcode: {searchedRoll['Barcode ID']}</strong>
                      <span className={`searched-roll-status ${searchedRoll['Status'] === 'issued' ? 'issued' : 'in_stock'}`}>
                        {searchedRoll['Status'] === 'issued' ? 'Issued' : 'In Stock'}
                      </span>
                    </div>
                    <div className="searched-roll-details">
                      <div className="searched-roll-item">
                        <span className="searched-roll-label">Fabric / Item Description</span>
                        <span className="searched-roll-value">{searchedRoll['Item Description']}</span>
                      </div>
                      <div className="searched-roll-item">
                        <span className="searched-roll-label">Shade</span>
                        <span className="searched-roll-value">{searchedRoll['Shade'] || '—'}</span>
                      </div>
                      <div className="searched-roll-item">
                        <span className="searched-roll-label">Weight</span>
                        <span className="searched-roll-value">{searchedRoll['Weight (KG)']} kg</span>
                      </div>
                      <div className="searched-roll-item">
                        <span className="searched-roll-label">Unit</span>
                        <span className="searched-roll-value">{searchedRoll['Unit'] || '—'}</span>
                      </div>
                      <div className="searched-roll-item">
                        <span className="searched-roll-label">Party / Source</span>
                        <span className="searched-roll-value">{searchedRoll['Party'] || searchedRoll['cmfName'] || '—'}</span>
                      </div>
                    </div>
                    {searchedRoll['Status'] !== 'issued' && (
                      <button
                        onClick={() => {
                          processBarcode(searchedRoll['Barcode ID']);
                          setSearchedRoll(null);
                          setSearchBarcodeInput('');
                        }}
                        style={{
                          marginTop: '12px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'block',
                          width: '100%',
                          textAlign: 'center',
                          transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.target.style.background = '#059669'}
                        onMouseOut={(e) => e.target.style.background = '#10b981'}
                      >
                        ➕ Add to Issue List
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isLoadingBarcodes && (
              <div className="global-barcode-tracker-badge loading" style={{
                marginTop: '8px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                textAlign: 'center'
              }}>
                🔄 Loading global barcode registry...
              </div>
            )}
            {!isLoadingBarcodes && globalIssuedBarcodes.size > 0 && (
              <div className="global-barcode-tracker-badge ready" style={{
                marginTop: '8px',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                textAlign: 'center',
                fontWeight: '600'
              }}>
                ✓ {globalIssuedBarcodes.size} unique barcodes tracked globally (no duplicates allowed)
              </div>
            )}

            {scannedRoll && (
              <div className="scan-success-card">
                <div className="success-icon">✓</div>
                <div className="success-details">
                  <div className="success-title">Last Scan Successful</div>
                  <div className="success-info">
                    <span>📦 {scannedRoll.rollNumber}</span>
                    <span>🧵 {scannedRoll.fabric}</span>
                    <span>🎨 {scannedRoll.shade} {scannedRoll.shadeEntry && `(Entry ${scannedRoll.shadeEntry})`}</span>
                    <span>⚖️ {scannedRoll.weight} kg</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Job Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <div className="card-icon">📋</div>
              <div className="card-content">
                <span className="card-label">Job Order</span>
                <span className="card-value">{selectedJob['Job Order No']}</span>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon">🏷️</div>
              <div className="card-content">
                <span className="card-label">Lot Number</span>
                <span className="card-value highlight">{selectedJob['Lot Number']}</span>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon">🧵</div>
              <div className="card-content">
                <span className="card-label">Fabric Type</span>
                <span className="card-value">{selectedJob['Fabric']}</span>
              </div>
            </div>
            <div className="summary-card">
              <div className="card-icon">📦</div>
              <div className="card-content">
                <span className="card-label">Total Quantity</span>
                <span className="card-value">{selectedJob['Quantity']} {selectedJob['Unit']}</span>
              </div>
            </div>
            <div className="summary-card" style={{ display: 'flex', alignItems: 'center' }}>
              <div className="card-icon">🪑</div>
              <div className="card-content" style={{ width: '100%' }}>
                <span className="card-label" style={{ color: '#94a3b8' }}>Default Table</span>
                <select
                  value={defaultTable}
                  onChange={(e) => handleDefaultTableChange(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#facc15',
                    fontSize: '15px',
                    fontWeight: '800',
                    outline: 'none',
                    cursor: 'pointer',
                    width: '100%',
                    padding: 0,
                    fontFamily: 'inherit'
                  }}
                >
                  {displayedTables.length > 0 ? (
                    displayedTables.map(tbl => (
                      <option key={tbl.id} value={tbl.name} style={{ background: '#1e293b', color: 'white' }}>{tbl.name}</option>
                    ))
                  ) : (
                    Array.from({ length: 20 }, (_, i) => `Table ${i + 1}`).map(t => (
                      <option key={t} value={t} style={{ background: '#1e293b', color: 'white' }}>{t}</option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Shade Selection Toolbar */}
          <div className="shade-toolbar">
            <div className="shade-toolbar-left">
              <span className="shade-toolbar-label">🎨 Select Shade Entry to Scan:</span>
              <div className="shade-toolbar-buttons">
                <button onClick={selectFirstShade} className="shade-btn select-all" disabled={isSubmitting}>
                  ✓ Select First Shade
                </button>
                <button onClick={deselectAllShades} className="shade-btn deselect-all" disabled={isSubmitting}>
                  ✗ Deselect All
                </button>
              </div>
            </div>
            <div className="shade-selection-count">
              {currentSelectedShade ? `Scanning: ${currentSelectedShade.name} (Entry ${currentSelectedShade.originalIndex + 1})` : 'No shade selected'}
            </div>
          </div>

          {/* Main Dashboard Grid */}
          <div className="dashboard-grid-two-col">
            {/* Left Column - Job Details */}
            <div className="info-panel">
              <div className="panel-header">
                <div className="panel-title">
                  <span className="title-icon">📄</span>
                  <h3>Job Order Details</h3>
                </div>
              </div>
              <div className="panel-body">
                <div className="info-grid">
                  <div className="info-group">
                    <h4>Basic Information</h4>
                    <div className="info-row">
                      <span className="info-label">Date:</span>
                      <span className="info-value">{selectedJob['Date']}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Fabric:</span>
                      <span className="info-value">{selectedJob['Fabric']}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Brand:</span>
                      <span className="info-value">{selectedJob['Brand']}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Size:</span>
                      <span className="info-value">{selectedJob['Size']}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Unit:</span>
                      <span className="info-value">{selectedJob['Unit']}</span>
                    </div>
                  </div>

                  <div className="info-group">
                    <h4>Production Details</h4>
                    <div className="info-row">
                      <span className="info-label">Garment Type:</span>
                      <span className="info-value">{selectedJob['Garment Type']}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Section:</span>
                      <span className="info-value">{selectedJob['Section']}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Season:</span>
                      <span className="info-value">{selectedJob['Season']}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Pattern/Style:</span>
                      <span className="info-value">{selectedJob['Pattern']} / {selectedJob['Style']}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Current Issuance */}
            <div className="issuance-panel">
              <div className="panel-header">
                <div className="panel-title">
                  <span className="title-icon">✂️</span>
                  <h3>Current Issuance</h3>
                </div>
                <div className="issuance-stats">
                  <div className="stat-chip">
                    <span>📊 Total Rolls</span>
                    <strong>{Object.values(issueQuantity).reduce((a, b) => a + b, 0)}</strong>
                  </div>
                  <div className="stat-chip">
                    <span>⚖️ Total Weight</span>
                    <strong>{Object.values(issueWeight).reduce((a, b) => a + b, 0).toFixed(2)} kg</strong>
                  </div>
                </div>
              </div>
              <div className="panel-body">
                <div className="shades-list">
                  {getShadesWithIds(selectedJob['Shade']).map((shadeObj, idx) => {
                    const shadeId = shadeObj.id;
                    const shadeName = shadeObj.name;
                    const shadeEntryNum = shadeObj.originalIndex + 1;

                    const previouslyIssued = getTotalIssuedWeightForShade(shadeName, shadeEntryNum);
                    const totalIssuedQty = previouslyIssued.totalRolls;
                    const totalIssuedWeight = previouslyIssued.totalWeight;
                    const currentQty = issueQuantity[shadeId] || 0;
                    const currentWeight = issueWeight[shadeId] || 0;
                    const isSelected = selectedShades[shadeId] || false;
                    const scannedCount = scannedBarcodes[shadeId]?.length || 0;
                    const wasPreviouslyIssued = totalIssuedQty > 0;

                    return (
                      <div className={`shade-item ${isSelected ? 'selected' : ''}`} key={shadeId}>
                        <div className="shade-item-header">
                          <label className="shade-select">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleShadeSelection(shadeId)}
                              disabled={isSubmitting}
                            />
                            <span className="shade-indicator">
                              <span className="shade-dot" style={{ backgroundColor: getShadeColor(normalizeShadeName(shadeName)) }}></span>
                              <span className="shade-name">
                                {shadeName} {getShadesWithIds(selectedJob['Shade']).filter(s => normalizeShadeName(s.name) === normalizeShadeName(shadeName)).length > 1 && `(Entry ${shadeEntryNum})`}
                              </span>
                            </span>
                          </label>
                          <div className="shade-stats">
                            {wasPreviouslyIssued && (
                              <span className="shade-issued-prev" style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                                📜 Previously Issued: {totalIssuedQty} rolls ({totalIssuedWeight.toFixed(2)} kg)
                              </span>
                            )}
                            {!wasPreviouslyIssued && (
                              <span className="shade-issued-prev" style={{ color: '#10b981' }}>
                                ✨ No previous issuance
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            marginTop: '10px',
                            padding: '12px 14px',
                            background: '#f8fafc',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0'
                          }}>
                            <span style={{ fontSize: '11px', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Assign Table for this shade:
                            </span>
                            <div 
                              className="scrollbar-hidden"
                              style={{ 
                                display: 'flex', 
                                flexWrap: 'nowrap', 
                                gap: '6px', 
                                marginTop: '4px',
                                overflowX: 'auto',
                                paddingBottom: '6px',
                                scrollbarWidth: 'none',
                                msOverflowStyle: 'none'
                              }}
                            >
                              {displayedTables.length > 0 ? (
                                displayedTables.map(tbl => {
                                  const t = tbl.name;
                                  const isTableSelected = shadeTableNumbers[shadeId] === t;
                                  const supervisorName = tbl.Supervisor ? tbl.Supervisor.name : 'Unassigned';
                                  return (
                                    <button
                                      key={tbl.id}
                                      type="button"
                                      title={`Supervisor: ${supervisorName}`}
                                      onClick={() => {
                                        setShadeTableNumbers(prev => ({
                                          ...prev,
                                          [shadeId]: t
                                        }));
                                      }}
                                      style={{
                                        padding: '5px 12px',
                                        background: isTableSelected ? 'linear-gradient(135deg, #10b981, #059669)' : '#ffffff',
                                        color: isTableSelected ? 'white' : '#475569',
                                        border: isTableSelected ? 'none' : '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        boxShadow: isTableSelected ? '0 2px 6px rgba(16,185,129,0.3)' : '0 1px 2px rgba(0,0,0,0.02)',
                                        transition: 'all 0.15s',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                      }}
                                    >
                                      {t.replace('Table ', 'T')}
                                      {tbl.Supervisor && loggedInUser?.role === 'Admin' && (
                                        <span style={{ fontSize: '9px', opacity: 0.8, marginLeft: '4px', fontWeight: '500' }}>
                                          ({(tbl.Supervisor.name || '').split(' ')[0]})
                                        </span>
                                      )}
                                    </button>
                                  );
                                })
                              ) : (
                                Array.from({ length: 20 }, (_, i) => `Table ${i + 1}`).map(t => {
                                  const isTableSelected = shadeTableNumbers[shadeId] === t;
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => {
                                        setShadeTableNumbers(prev => ({
                                          ...prev,
                                          [shadeId]: t
                                        }));
                                      }}
                                      style={{
                                        padding: '5px 12px',
                                        background: isTableSelected ? 'linear-gradient(135deg, #10b981, #059669)' : '#ffffff',
                                        color: isTableSelected ? 'white' : '#475569',
                                        border: isTableSelected ? 'none' : '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        boxShadow: isTableSelected ? '0 2px 6px rgba(16,185,129,0.3)' : '0 1px 2px rgba(0,0,0,0.02)',
                                        transition: 'all 0.15s',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                      }}
                                    >
                                      {t.replace('Table ', 'T')}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {wasPreviouslyIssued && previouslyIssued.allBarcodes.length > 0 && (
                          <div style={{ marginTop: '8px', padding: '8px', background: '#fef3c7', borderRadius: '6px' }}>
                            <details>
                              <summary style={{ fontSize: '11px', cursor: 'pointer', color: '#92400e' }}>
                                🏷️ Previously Used Barcodes ({previouslyIssued.allBarcodes.length})
                              </summary>
                              <div style={{ marginTop: '5px', fontSize: '10px', maxHeight: '80px', overflowY: 'auto' }}>
                                {previouslyIssued.allBarcodes.map((barcode, idx) => (
                                  <div key={idx} style={{ padding: '2px 0', fontFamily: 'monospace', color: '#78350f' }}>
                                    {barcode}
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        )}

                        {(currentQty > 0 || currentWeight > 0) && (
                          <div className="shade-current-badge">
                            <span>📌 Current Session: {currentQty} rolls ({currentWeight.toFixed(2)} kg)</span>
                            {scannedCount > 0 && (
                              <div className="scanned-barcodes-list">
                                <details>
                                  <summary style={{ fontSize: '11px', cursor: 'pointer', color: '#666' }}>
                                    🏷️ New Barcodes ({scannedCount})
                                  </summary>
                                  <div style={{ marginTop: '5px', fontSize: '10px', maxHeight: '100px', overflowY: 'auto' }}>
                                    {scannedBarcodes[shadeId]?.map((barcode, idx) => (
                                      <div key={idx} style={{ padding: '2px 0', fontFamily: 'monospace' }}>
                                        {barcode}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="issuance-action">
                  <button
                    onClick={handleIssueFabric}
                    className="confirm-button"
                    disabled={Object.values(issueQuantity).reduce((a, b) => a + b, 0) === 0 || isSubmitting}
                  >
                    {isSubmitting ? '⏳ Processing...' : '✓ Confirm Issuance'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Kharcha (Accessories / Expense) Issuance Panel ── */}
          {selectedJob && (
            <div className="kharcha-issuance-card" style={{
              borderRadius: '16px',
              boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
              marginBottom: '24px',
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 22px',
                background: 'linear-gradient(135deg, #5f3dc4 0%, #0b7285 100%)',
                color: '#fff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>💰</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '0.2px' }}>Kharcha Issuance</div>
                    <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '1px' }}>Accessories / Expense items for this lot</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#fff',
                    background: 'rgba(255,255,255,0.15)',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    userSelect: 'none'
                  }}>
                    <input
                      type="checkbox"
                      checked={noKharcha}
                      onChange={e => {
                        setNoKharcha(e.target.checked);
                        if (e.target.checked) {
                          setKharchaItems([{ id: Date.now(), item: 'No Kharcha', weight: '0', shade: 'N/A', mode: 'manual', barcodeId: '', loading: false }]);
                        } else {
                          setKharchaItems([{ id: Date.now(), item: '', weight: '', shade: '', mode: 'manual', barcodeId: '', loading: false }]);
                        }
                      }}
                      style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#10b981' }}
                    />
                    No Kharcha
                  </label>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', opacity: 0.75 }}>TOTAL WEIGHT</div>
                    <div style={{ fontSize: '18px', fontWeight: '800' }}>{getTotalKharchaWeight().toFixed(2)} kg</div>
                  </div>
                  <button
                    onClick={addKharchaRow}
                    disabled={noKharcha}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '8px 16px',
                      background: noKharcha ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.18)',
                      color: noKharcha ? 'rgba(255,255,255,0.4)' : '#fff',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '9px',
                      fontSize: '13px', fontWeight: '700',
                      cursor: noKharcha ? 'not-allowed' : 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={e => { if (!noKharcha) e.currentTarget.style.background = 'rgba(255,255,255,0.28)'; }}
                    onMouseOut={e => { if (!noKharcha) e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
                  >
                    + Add Item
                  </button>
                </div>
              </div>

              {/* Table Header */}
              <div className="kharcha-table-header" style={{
                display: 'grid',
                gridTemplateColumns: '40px 1.2fr 1.5fr 1.2fr 1.8fr 44px',
                gap: '8px',
                padding: '10px 22px',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                opacity: noKharcha ? 0.5 : 1
              }}>
                <div>#</div>
                <div>Select Shade</div>
                <div>Item Name</div>
                <div>Entry Mode</div>
                <div>Weight (KG) / Barcode ID</div>
                <div></div>
              </div>

              {/* Rows */}
              <div className="kharcha-table-body" style={{ padding: '10px 22px 16px' }}>
                {noKharcha ? (
                  <div className="kharcha-empty-box" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '30px',
                    borderRadius: '12px',
                    fontWeight: '600',
                    fontSize: '14px',
                    gap: '8px'
                  }}>
                    <span>🚫</span> No Kharcha items to issue for this lot. Ready to submit.
                  </div>
                ) : (
                  kharchaItems.map((row, idx) => (
                  <div
                    key={row.id}
                    className="kharcha-table-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 1.2fr 1.5fr 1.2fr 1.8fr 44px',
                      gap: '8px',
                      alignItems: 'center',
                      marginBottom: '8px',
                      padding: '8px 0',
                      borderBottom: idx < kharchaItems.length - 1 ? '1px solid var(--border, #f1f5f9)' : 'none'
                    }}
                  >
                    {/* # */}
                    <div style={{
                      width: '28px', height: '28px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg,#5f3dc4,#7048e8)',
                      color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: '700'
                    }}>{idx + 1}</div>

                    {/* Shade selection */}
                    <select
                      value={row.shade}
                      onChange={e => updateKharchaRow(row.id, 'shade', e.target.value)}
                      className="kharcha-input"
                      style={{
                        width: '100%',
                        padding: '9px 13px',
                        borderRadius: '9px',
                        fontSize: '13px',
                        fontWeight: '500',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="">Select Shade</option>
                      {getShadesWithIds(selectedJob['Shade']).map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>

                    {/* Item Name */}
                    <input
                      type="text"
                      placeholder="Item name (Thread, Elastic...)"
                      value={row.item}
                      onChange={e => updateKharchaRow(row.id, 'item', e.target.value)}
                      className="kharcha-input"
                      style={{
                        width: '100%',
                        padding: '9px 13px',
                        borderRadius: '9px',
                        fontSize: '13px',
                        fontWeight: '500',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />

                    {/* Mode selector */}
                    <div className="kharcha-mode-wrapper" style={{ display: 'flex', borderRadius: '9px', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => {
                          updateKharchaRow(row.id, 'mode', 'manual');
                          updateKharchaRow(row.id, 'barcodeId', '');
                        }}
                        className={`kharcha-mode-btn ${row.mode === 'manual' ? 'active' : ''}`}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          fontSize: '11px',
                          fontWeight: '700',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => updateKharchaRow(row.id, 'mode', 'barcode')}
                        className={`kharcha-mode-btn ${row.mode === 'barcode' ? 'active' : ''}`}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          fontSize: '11px',
                          fontWeight: '700',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Scan
                      </button>
                    </div>

                    {/* Weight or Barcode input */}
                    <div>
                      {row.mode === 'manual' ? (
                        <input
                          type="number"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          value={row.weight}
                          onChange={e => updateKharchaRow(row.id, 'weight', e.target.value)}
                          className="kharcha-input"
                          style={{
                            width: '100%',
                            padding: '9px 13px',
                            borderRadius: '9px',
                            fontSize: '13px',
                            fontWeight: '600',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                          <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                            <input
                              type="text"
                              placeholder="Barcode ID"
                              value={row.barcodeInput || ''}
                              onChange={e => updateKharchaRow(row.id, 'barcodeInput', e.target.value)}
                              onKeyPress={e => {
                                if (e.key === 'Enter' && row.barcodeInput) {
                                  e.preventDefault();
                                  handleKharchaBarcodeSearch(row.id, row.barcodeInput);
                                }
                              }}
                              className="kharcha-input"
                              style={{
                                flex: 1,
                                padding: '9px 13px',
                                borderRadius: '9px',
                                fontSize: '13px',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleKharchaBarcodeSearch(row.id, row.barcodeInput)}
                              disabled={row.loading}
                              style={{
                                padding: '8px 10px',
                                background: '#0b7285',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '9px',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              {row.loading ? '...' : 'Verify'}
                            </button>
                          </div>
                          {row.barcodes && row.barcodes.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                              {row.barcodes.map(b => (
                                <span
                                  key={b.barcodeId}
                                  className="kharcha-barcode-pill"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                  }}
                                >
                                  🏷️ {b.barcodeId} ({b.weight.toFixed(2)} kg)
                                  <button
                                    type="button"
                                    onClick={() => removeKharchaBarcode(row.id, b.barcodeId)}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: 'inherit',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      padding: '0 0 0 2px',
                                      fontWeight: '800'
                                    }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          {row.weight && (
                            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold', marginLeft: '4px' }}>
                              ⚖️ Total Weight: {row.weight} kg
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeKharchaRow(row.id)}
                      disabled={kharchaItems.length === 1}
                      title="Remove row"
                      style={{
                        width: '34px', height: '34px',
                        border: 'none',
                        borderRadius: '8px',
                        background: kharchaItems.length === 1 ? 'rgba(148,163,184,0.1)' : 'rgba(239,68,68,0.15)',
                        color: kharchaItems.length === 1 ? '#94a3b8' : '#ef4444',
                        fontSize: '16px',
                        cursor: kharchaItems.length === 1 ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.2s',
                        flexShrink: 0
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

              {/* Footer summary */}
              <div className="kharcha-footer-summary" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 22px',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ fontWeight: '700', color: '#818cf8' }}>{kharchaItems.filter(r => r.item.trim()).length}</span> item(s) entered
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                  <div style={{ fontSize: '13px' }}>
                    Total Weight: <span className="kharcha-total-weight-text" style={{ fontWeight: '800', fontSize: '15px' }}>{getTotalKharchaWeight().toFixed(2)} kg</span>
                  </div>
                  <button
                    onClick={addKharchaRow}
                    className="kharcha-add-row-btn"
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '12px', fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      marginRight: '8px'
                    }}
                  >
                    + Add Row
                  </button>
                  <button
                    onClick={handleIssueKharcha}
                    disabled={kharchaItems.filter(item => item.item.trim() !== '' || item.weight !== '').length === 0 || isSubmitting}
                    style={{
                      padding: '7px 16px',
                      background: 'linear-gradient(135deg,#5f3dc4,#7048e8)',
                      color: '#fff', border: 'none', borderRadius: '8px',
                      fontSize: '12px', fontWeight: '700',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(95,61,196,0.3)',
                      transition: 'all 0.2s',
                      opacity: kharchaItems.filter(item => item.item.trim() !== '' || item.weight !== '').length === 0 || isSubmitting ? 0.6 : 1
                    }}
                  >
                    {isSubmitting ? '⏳ Processing...' : '✓ Issue Kharcha'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* History Section with Infinite Scroll */}
          {issueHistory.length > 0 && (
            <div className="history-section">
              <div className="history-header">
                <div className="history-title">
                  <span className="title-icon">📜</span>
                  <h3>Issuance History</h3>
                </div>
                <div className="history-stats">
                  <span className="history-stat">{historyTotalRows || issueHistory.length} total transactions</span>
                  <span className="history-stat">Total: {(parseFloat(getTotalIssuedWeight()) || 0).toFixed(2)} kg</span>
                  {loadingHistory && <span className="history-stat loading">Loading...</span>}
                </div>
              </div>
              <div className="history-list">
                {issueHistory.map((record, index) => (
                  <div className="history-card" key={record.id || record.issuanceId || index}>
                    <div className="history-card-header">
                      <div className="history-date">
                        {new Date(record.issuedAt || record.timestamp).toLocaleString()}
                      </div>
                      <div className="history-badge">
                        {parseInt(record.totalQuantity || record.totalQty) || 0} rolls · {(parseFloat(record.totalWeight) || 0).toFixed(2)} kg
                      </div>
                      {record.issuanceId && (
                        <div className="history-id">
                          ID: {record.issuanceId}
                        </div>
                      )}
                      {record.offline && (
                        <div className="history-offline-badge" style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '12px', fontSize: '10px' }}>
                          📱 Offline
                        </div>
                      )}
                    </div>
                    <div className="history-items">
                      {(record.items || record.issuedItems || []).map((item, i) => (
                        <span key={i} className="history-item-tag">
                          {item.shade}{item.shadeEntry > 1 && ` (Entry ${item.shadeEntry})`}: {parseInt(item.qty || item.quantity) || 0} rolls ({(parseFloat(item.weight) || 0).toFixed(2)} kg){item.tableNumber && ` [${item.tableNumber}]`}
                        </span>
                      ))}
                    </div>
                    {record.kharchaItems && record.kharchaItems.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 4px' }}>
                        <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 'bold', alignSelf: 'center' }}>💰 Kharcha:</span>
                        {record.kharchaItems.map((k, ki) => (
                          <span key={ki} className="history-item-tag" style={{ background: 'rgba(253, 230, 138, 0.15)', borderColor: 'rgba(253, 230, 138, 0.3)', color: '#fef08a' }}>
                            {k.item}: {parseFloat(k.weight || 0).toFixed(2)} kg
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Intersection observer target for infinite scroll */}
                <div ref={historyEndRef} style={{ height: '20px', margin: '10px 0' }} />

                {/* Loading more indicator */}
                {loadingHistory && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    <span>Loading more history...</span>
                  </div>
                )}

                {/* End of history message */}
                {!hasMoreHistory && issueHistory.length > 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '12px' }}>
                    ✓ End of history
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state" style={{ background: '#f8fafc', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="empty-state-card-premium" style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: '24px',
            padding: '50px 30px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02)',
            textAlign: 'center',
            maxWidth: '600px',
            width: '100%',
            margin: '40px auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              fontSize: '54px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '10px',
              lineHeight: 1
            }}>⚡</div>
            <h3 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: '#0f172a' }}>Fabric Issuance Dashboard</h3>
            <p style={{ color: '#64748b', fontSize: '14.5px', margin: '0 0 10px 0', lineHeight: '1.6', maxWidth: '480px' }}>
              Search for a Lot Number to display production details, perform shade matching verification, scan roll barcodes, and issue fabric to active cutting tables.
            </p>
            <div style={{
              display: 'flex',
              gap: '10px',
              width: '100%',
              maxWidth: '480px',
              marginTop: '10px',
              flexWrap: 'wrap'
            }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#64748b' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Enter Lot Number (e.g., 11456)"
                  value={searchLot}
                  onChange={(e) => setSearchLot(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  style={{
                    width: '100%',
                    padding: '14px 16px 14px 44px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontSize: '15px',
                    fontWeight: '600',
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s'
                  }}
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '14px 28px',
                  borderRadius: '12px',
                  fontWeight: '700',
                  fontSize: '15px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(30, 60, 114, 0.15)',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: loading ? 0.8 : 1
                }}
              >
                {loading && <span className="search-spinner" style={{ width: '16px', height: '16px' }} />}
                {loading ? 'Searching Lot...' : 'Search Lot'}
              </button>
            </div>
            {loading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '14px 24px',
                background: '#eff6ff',
                border: '1.5px solid #bfdbfe',
                borderRadius: '12px',
                color: '#1d4ed8',
                fontSize: '14px',
                fontWeight: '600',
                marginTop: '10px',
                width: '100%',
                maxWidth: '480px',
                boxSizing: 'border-box',
                animation: 'fadeInModal 0.2s ease'
              }}>
                <span className="search-spinner" style={{ width: '18px', height: '18px', borderWidth: '2.5px', borderTopColor: '#2563eb' }} />
                <span>Fetching Job Order & Shade details for Lot <strong>{searchLot}</strong>...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fabric Receiving Modal */}
      {showReceiving && selectedJob && (
        <FabricReceiving
          selectedJob={selectedJob}
          onClose={() => setShowReceiving(false)}
          onReceiveComplete={handleReceiveComplete}
        />
      )}

      {/* ── Matching Flow Modal ─────────────────────────────────────── */}
      {matchingModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeInModal 0.2s ease'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '20px',
            padding: '36px 40px',
            maxWidth: '440px',
            width: '90%',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            textAlign: 'center',
            animation: 'slideUpModal 0.25s cubic-bezier(0.34,1.56,0.64,1)'
          }}>
            {matchingModal.step === 'ask_matching' ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                <h2 style={{
                  color: '#f1f5f9', fontSize: '20px', fontWeight: '700',
                  marginBottom: '10px', letterSpacing: '0.3px'
                }}>Matching Check Required</h2>
                <p style={{
                  color: '#94a3b8', fontSize: '14px', lineHeight: '1.6',
                  marginBottom: '28px'
                }}>
                  Before issuing weight against this shade, is there any
                  <strong style={{ color: '#60a5fa' }}> matching </strong>
                  to be verified?
                </p>
                <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleMatchingResponse(false)}
                    style={{
                      flex: 1, padding: '13px 20px',
                      background: 'linear-gradient(135deg, #0ca678, #0b7285)',
                      color: 'white', border: 'none', borderRadius: '12px',
                      fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(12,166,120,0.25)',
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(12,166,120,0.45)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(12,166,120,0.25)'; }}
                  >
                    ✅ No,there will be no matching
                  </button>
                  <button
                    onClick={() => handleMatchingResponse(true)}
                    style={{
                      flex: 1, padding: '13px 20px',
                      background: 'linear-gradient(135deg, #5f3dc4, #7048e8)',
                      color: 'white', border: 'none', borderRadius: '12px',
                      fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(95,61,196,0.35)',
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(95,61,196,0.5)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(95,61,196,0.35)'; }}
                  >
                    🔍 Yes, there will be a matching
                  </button>
                </div>
              </>
            ) : matchingModal.step === 'ask_passed' ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <h2 style={{
                  color: '#f1f5f9', fontSize: '20px', fontWeight: '700',
                  marginBottom: '10px', letterSpacing: '0.3px'
                }}>Matching Result</h2>
                <p style={{
                  color: '#94a3b8', fontSize: '14px', lineHeight: '1.6',
                  marginBottom: '28px'
                }}>
                  Has the matching
                  <strong style={{ color: '#facc15' }}> passed </strong>
                  successfully?
                </p>
                <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleMatchingPassedResponse(false)}
                    style={{
                      flex: 1, padding: '13px 20px',
                      background: 'linear-gradient(135deg, #e03131, #c92a2a)',
                      color: 'white', border: 'none', borderRadius: '12px',
                      fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(224,49,49,0.35)',
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(224,49,49,0.5)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(224,49,49,0.35)'; }}
                  >
                    ❌ No,the matching was not passed successfully
                  </button>
                  <button
                    onClick={() => handleMatchingPassedResponse(true)}
                    style={{
                      flex: 1, padding: '13px 20px',
                      background: 'linear-gradient(135deg, #0ca678, #059669)',
                      color: 'white', border: 'none', borderRadius: '12px',
                      fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(12,166,120,0.35)',
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(12,166,120,0.5)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(12,166,120,0.35)'; }}
                  >
                    ✅ Yes, the matching passed successfully
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>👤</div>
                <h2 style={{
                  color: '#f1f5f9', fontSize: '20px', fontWeight: '700',
                  marginBottom: '10px', letterSpacing: '0.3px'
                }}>Senior Approval</h2>
                <p style={{
                  color: '#94a3b8', fontSize: '14px', lineHeight: '1.6',
                  marginBottom: '20px'
                }}>
                  From whom in senior management was the matching passed?
                </p>
                <div style={{ marginBottom: '24px' }}>
                  <input
                    type="text"
                    id="matching-approver-input"
                    placeholder="Enter senior manager's name..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '12px',
                      color: 'white',
                      fontSize: '14px',
                      outline: 'none',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                      textAlign: 'center'
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleMatchingApproverSubmit(e.target.value);
                      }
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
                  <button
                    onClick={() => setMatchingModal({ step: 'ask_passed' })}
                    style={{
                      flex: 1, padding: '13px 20px',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#bbb', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px',
                      fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      const val = document.getElementById('matching-approver-input')?.value;
                      handleMatchingApproverSubmit(val);
                    }}
                    style={{
                      flex: 1, padding: '13px 20px',
                      background: 'linear-gradient(135deg, #0ca678, #059669)',
                      color: 'white', border: 'none', borderRadius: '12px',
                      fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(12,166,120,0.35)',
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(12,166,120,0.5)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(12,166,120,0.35)'; }}
                  >
                    Confirm & Allow
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MTR Weight Input Modal ─────────────────────────────────── */}
      {mtrWeightModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeInModal 0.2s ease'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '20px',
            padding: '36px 40px',
            maxWidth: '440px',
            width: '90%',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            textAlign: 'center',
            animation: 'slideUpModal 0.25s cubic-bezier(0.34,1.56,0.64,1)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚖️</div>
            <h2 style={{
              color: '#f1f5f9', fontSize: '20px', fontWeight: '700',
              marginBottom: '10px', letterSpacing: '0.3px'
            }}>Enter Weight in KGS</h2>
            <p style={{
              color: '#94a3b8', fontSize: '14px', lineHeight: '1.6',
              marginBottom: '20px'
            }}>
              Barcode <strong style={{ color: '#facc15' }}>{mtrWeightModal.barcodeId}</strong> contains unit in <strong style={{ color: '#60a5fa' }}>MTR</strong>.<br/>
              Please write/input the weight in <strong style={{ color: '#10b981' }}>KGS</strong> below:
            </p>
            <div style={{ marginBottom: '24px' }}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                id="mtr-weight-input"
                placeholder="Enter weight in KG (e.g. 15.45)..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '15px',
                  fontWeight: '700',
                  outline: 'none',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                  textAlign: 'center'
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    submitMtrWeight(e.target.value);
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setMtrWeightModal(null);
                  setTimeout(() => barcodeInputRef.current?.focus(), 100);
                }}
                style={{
                  flex: 1, padding: '13px 20px',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#bbb', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px',
                  fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = document.getElementById('mtr-weight-input')?.value;
                  submitMtrWeight(val);
                }}
                style={{
                  flex: 1, padding: '13px 20px',
                  background: 'linear-gradient(135deg, #0ca678, #059669)',
                  color: 'white', border: 'none', borderRadius: '12px',
                  fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(12,166,120,0.35)',
                  transition: 'transform 0.15s, box-shadow 0.15s'
                }}
                onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(12,166,120,0.5)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(12,166,120,0.35)'; }}
              >
                Confirm Weight
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .search-spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        /* ── Theme Styling & Layout Enhancements ── */
        .fabric-issued-container {
          max-width: 2000px;
          margin: 0 auto;
          padding: 4px;
          color: #212529;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .hero-section {
          background: linear-gradient(135deg, #5f3dc4 0%, #0b7285 100%) !important;
          border-radius: 12px !important;
          box-shadow: 0 4px 16px rgba(95, 61, 196, 0.15) !important;
          margin-bottom: 10px !important;
          padding: 14px 24px !important;
        }

        .hero-back-btn {
          background: rgba(255, 255, 255, 0.15) !important;
          border: 1px solid rgba(255, 255, 255, 0.25) !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          padding: 6px 12px !important;
          font-size: 12px !important;
        }
        .hero-back-btn:hover {
          background: rgba(255, 255, 255, 0.25) !important;
        }

        .hero-button {
          background: #ffffff !important;
          color: #5f3dc4 !important;
          border-radius: 8px !important;
          font-weight: 700 !important;
          padding: 10px 20px !important;
          transition: all 0.2s ease !important;
        }
        .hero-button:hover {
          background: #f8fafc !important;
          transform: translateY(-1px) !important;
        }
        
        .hero-button.secondary {
          background: rgba(255, 255, 255, 0.12) !important;
          color: #ffffff !important;
          border: 1px solid rgba(255, 255, 255, 0.25) !important;
        }
        .hero-button.secondary:hover {
          background: rgba(255, 255, 255, 0.22) !important;
        }

        .top-search-input, .hero-input {
          border-radius: 8px !important;
          border: 2px solid #e9ecef !important;
          transition: all 0.2s ease !important;
          padding: 10px 14px 10px 42px !important; /* Left padding for search icon */
          font-weight: 550 !important;
        }
        .scanner-input-modern {
          border-radius: 8px !important;
          border: 2px solid #e9ecef !important;
          transition: all 0.2s ease !important;
          padding: 10px 14px !important;
          font-weight: 550 !important;
        }
        .top-search-input:focus, .hero-input:focus, .scanner-input-modern:focus {
          border-color: #5f3dc4 !important;
          box-shadow: 0 0 0 3.5px rgba(95, 61, 196, 0.15) !important;
          background-color: #ffffff !important;
        }
        .hero-input:focus {
          color: #0f172a !important;
        }
        .hero-input:focus::placeholder {
          color: #94a3b8 !important;
        }
        .hero-input:-webkit-autofill,
        .hero-input:-webkit-autofill:hover, 
        .hero-input:-webkit-autofill:focus, 
        .hero-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px #ffffff inset !important;
          -webkit-text-fill-color: #0f172a !important;
          color: #0f172a !important;
        }

        .top-search-btn {
          background: #5f3dc4 !important;
          color: white !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          padding: 10px 20px !important;
          border: none !important;
          transition: all 0.2s ease !important;
          cursor: pointer !important;
        }
        .top-search-btn:hover {
          background: #512da8 !important;
        }

        .top-refresh-btn {
          background: #ffffff !important;
          border: 2px solid #e9ecef !important;
          color: #495057 !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          padding: 8px 16px !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
        }
        .top-refresh-btn:hover {
          background: #f8f9fa !important;
          border-color: #ced4da !important;
        }

        .top-receiving-btn {
          background: linear-gradient(135deg, #0b7285, #096374) !important;
          color: white !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 10px rgba(11, 114, 133, 0.15) !important;
          font-weight: 600 !important;
          border: none !important;
          padding: 10px 18px !important;
          transition: all 0.2s ease !important;
          cursor: pointer !important;
        }
        .top-receiving-btn:hover {
          background: linear-gradient(135deg, #095c6b, #064752) !important;
          transform: translateY(-1px) !important;
        }

        .summary-card {
          background: #ffffff !important;
          border: 1.5px solid #e9ecef !important;
          border-radius: 12px !important;
          padding: 16px !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02) !important;
          transition: all 0.25s ease !important;
        }
        .summary-card:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 14px rgba(0,0,0,0.06) !important;
          border-color: rgba(95, 61, 196, 0.25) !important;
        }
        .summary-card .card-icon {
          background: rgba(95, 61, 196, 0.08) !important;
          color: #5f3dc4 !important;
          width: 44px !important;
          height: 44px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 20px !important;
        }
        .summary-card .card-value.highlight {
          color: #5f3dc4 !important;
        }

        .info-panel, .issuance-panel, .history-section {
          background: #ffffff !important;
          border: 1.5px solid #e9ecef !important;
          border-radius: 12px !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.02) !important;
          margin-bottom: 24px !important;
          overflow: hidden !important;
        }
        .panel-header, .history-header {
          background-color: #f8f9fa !important;
          border-bottom: 1.5px solid #e9ecef !important;
          padding: 14px 20px !important;
        }
        .panel-title h3, .history-title h3 {
          font-size: 15px !important;
          font-weight: 800 !important;
          color: #212529 !important;
        }
        .panel-title .title-icon, .history-title .title-icon {
          color: #5f3dc4 !important;
        }

        .shade-item {
          border: 1.5px solid #e9ecef !important;
          border-radius: 10px !important;
          padding: 16px !important;
          margin-bottom: 12px !important;
          transition: all 0.2s ease !important;
        }
        .shade-item.selected {
          border-color: #5f3dc4 !important;
          background-color: rgba(95, 61, 196, 0.01) !important;
          box-shadow: 0 4px 12px rgba(95, 61, 196, 0.05) !important;
        }

        .confirm-button {
          background: linear-gradient(135deg, #5f3dc4 0%, #7048e8 100%) !important;
          color: white !important;
          border-radius: 10px !important;
          font-weight: 700 !important;
          padding: 14px 24px !important;
          border: none !important;
          box-shadow: 0 4px 15px rgba(95, 61, 196, 0.2) !important;
          transition: all 0.2s ease !important;
          cursor: pointer !important;
        }
        .confirm-button:hover:not(:disabled) {
          background: linear-gradient(135deg, #512da8 0%, #5f3dc4 100%) !important;
          box-shadow: 0 6px 20px rgba(95, 61, 196, 0.3) !important;
          transform: translateY(-1px) !important;
        }
        .confirm-button:disabled {
          background: #e9ecef !important;
          color: #adb5bd !important;
          box-shadow: none !important;
          cursor: not-allowed !important;
        }

        .history-card {
          border: 1.5px solid #e9ecef !important;
          border-radius: 10px !important;
          padding: 16px !important;
          margin-bottom: 12px !important;
          transition: all 0.2s ease !important;
        }
        .history-card:hover {
          border-color: rgba(95, 61, 196, 0.25) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03) !important;
        }
        .history-badge {
          background: rgba(95, 61, 196, 0.08) !important;
          color: #5f3dc4 !important;
          font-weight: 700 !important;
          border-radius: 6px !important;
          padding: 4px 10px !important;
        }
        .history-item-tag {
          background: #f1f3f5 !important;
          border: 1px solid #e9ecef !important;
          color: #495057 !important;
          border-radius: 6px !important;
          padding: 4px 10px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
        }
      `}</style>
    </div>
  );
};

export default FabricIssued;
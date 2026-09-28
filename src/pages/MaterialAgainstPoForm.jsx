import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, BASE_URL } from '../store.js';
import LocationPicker from '../components/LocationPicker.jsx';
import {
  Printer, Play, Square, RotateCcw,
  AlertTriangle, AlertCircle, CheckCircle, Box, Hourglass, FileText, ArrowLeft
} from 'lucide-react';
import '../Design/FabricStickerForm.css';

const MaterialAgainstPoForm = () => {
  const navigate = useNavigate();

  // Get logged in user data
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Main Form Data
  const [formData, setFormData] = useState({
    poNumber: '',
    cmfName: '',
    fabricName: '',
    group: '',
    shade: '',
    weight: '', // will store meters in database weight column
    lotNumber: '',
    billNumber: '',
    location: '',
    receivedPerson: '',
    authorizedPerson: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Manual Meters Input
  const [manualMeters, setManualMeters] = useState('');

  // PO Items from Google Sheet
  const [poItems, setPoItems] = useState([]);
  const [isFetchingPo, setIsFetchingPo] = useState(false);

  // Fetch PO Details from backend sheet endpoint
  const fetchPoDetailsFromSheet = async () => {
    const poNum = formData.poNumber.trim();
    if (!poNum) {
      showNotification('Please enter a PO number first', 'warning');
      return;
    }

    setIsFetchingPo(true);
    try {
      const res = await fetch(`${BASE_URL}/po/details/${encodeURIComponent(poNum)}`);
      if (!res.ok) {
        throw new Error('PO not found or spreadsheet error');
      }
      const data = await res.json();
      if (data.success && data.items.length > 0) {
        setPoItems(data.items);
        showNotification(`✓ Loaded ${data.items.length} items from PO spreadsheet`, 'success');
        updateInstruction(`Select an item from the PO list below to auto-populate fields.`, 'info');
      } else {
        setPoItems([]);
        showNotification('No items found for this PO number', 'warning');
      }
    } catch (e) {
      console.error(e);
      showNotification('Failed to fetch PO details from Google Sheet', 'error');
      setPoItems([]);
    } finally {
      setIsFetchingPo(false);
    }
  };

  const handleSelectPoItem = (item) => {
    setFormData(prev => ({
      ...prev,
      fabricName: item.description,
      group: item.uom || item.department || 'MTR',
      shade: '', // user fills manually
    }));
    showNotification(`✓ Selected item: ${item.description}`, 'info');
  };


  // Batch processing states
  const [totalRollsInBatch, setTotalRollsInBatch] = useState(1);
  const [currentRollNumber, setCurrentRollNumber] = useState(0);
  const [completedRolls, setCompletedRolls] = useState([]);
  const [batchActive, setBatchActive] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPrintedRoll, setLastPrintedRoll] = useState(null);

  // UI Instructions
  const [uiInstruction, setUiInstruction] = useState('Fill in PO and item details, set rolls quantity, and start the batch.');
  const [instructionType, setInstructionType] = useState('info');

  // Step indicators state
  const [activeSteps, setActiveSteps] = useState({
    step1: false, // Fill Form Details
    step2: false, // Set Total Rolls
    step3: false, // Start Batch
    step4: false, // Enter Meters & Print
    step5: false  // Complete
  });

  // Batch info data
  const [batchNumber, setBatchNumber] = useState('');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchTime, setBatchTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  // Sequential barcode tracking
  const [nextBarcodeId, setNextBarcodeId] = useState(null);
  const [barcodeSequence, setBarcodeSequence] = useState({
    current: 0,
    next: 1,
    lastGenerated: null
  });
  const [isLoadingSequence, setIsLoadingSequence] = useState(true);

  // Print service states
  const [printServiceStatus, setPrintServiceStatus] = useState('connecting');
  const wsRef = useRef(null);
  const [wsReady, setWsReady] = useState(false);

  // Network offline queue states
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);

  // Notification Banner
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((msg, type = 'info') => {
    setNotification({ text: msg, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  }, []);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch sequential barcode status on load & network status updates
  useEffect(() => {
    fetchNextSequenceNumber();
    checkNetworkStatus();
    checkPrintServiceStatus();

    // Reload stored queue if exists
    const storedQueue = localStorage.getItem('material_offline_queue');
    if (storedQueue) {
      try {
        setOfflineQueue(JSON.parse(storedQueue));
      } catch (e) {
        console.error('Error loading stored offline queue:', e);
      }
    }

    const interval = setInterval(checkNetworkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  // Sync offline queue when online status changes to true
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      syncOfflineQueue();
    }
  }, [isOnline]);

  // Read user data
  useEffect(() => {
    const userData = localStorage.getItem('twms_user');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setLoggedInUser(parsed);
        // Pre-fill received by default
        setFormData(prev => ({
          ...prev,
          receivedPerson: parsed.name || '',
          authorizedPerson: 'Sahil Sir'
        }));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Check network/backend status
  const checkNetworkStatus = async () => {
    if (isCheckingNetwork) return;
    setIsCheckingNetwork(true);
    try {
      const ctrl = new AbortController();
      let res;
      try {
        res = await fetch(`${BASE_URL}/health`, { signal: ctrl.signal });
      } catch (fetchErr) {
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          res = await fetch('http://localhost:5001/api/health', { signal: ctrl.signal });
        } else {
          throw fetchErr;
        }
      }
      clearTimeout(timeoutId);
      if (res.ok) {
        setIsOnline(true);
      } else {
        setIsOnline(true); // fallback
      }
    } catch (err) {
      setIsOnline(false);
    } finally {
      setIsCheckingNetwork(false);
    }
  };

  // Stub for print service status check
  const checkPrintServiceStatus = () => {};

  // Connect to Local Python Print Service via WebSocket
  useEffect(() => {
    let wsHost = 'localhost';
    const WS_URL = `ws://${wsHost}:8765`;
    let isDisposed = false;
    let reconnectTimeout = null;
    let connectionTimeout = null;

    const connectWS = () => {
      if (isDisposed) return;
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close();
        } catch (e) {}
      }

      console.log('🔌 [PO Print] Connecting to print service at:', WS_URL);
      
      connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
          setPrintServiceStatus('error');
        }
      }, 5000);

      try {
        wsRef.current = new WebSocket(WS_URL);
      } catch (e) {
        setPrintServiceStatus('disconnected');
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connectWS, 6000);
        }
        return;
      }

      wsRef.current.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('✅ [PO Print] WebSocket connection established');
        setPrintServiceStatus('connected');
        
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'auth',
            token: 'fabric-print-secret-key-2024'
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          switch (response.type) {
            case 'auth_success':
              setPrintServiceStatus('ready');
              setWsReady(true);
              break;
            case 'auth_failed':
              setPrintServiceStatus('error');
              setWsReady(false);
              break;
            case 'print_result':
              if (response.success) {
                showNotification(`✓ Sticker printed successfully!`, 'success');
              } else {
                showNotification(`✗ Print failed: ${response.message}`, 'error');
              }
              break;
            default:
              console.log('[PO Print] Message:', response);
          }
        } catch (error) {
          console.error(error);
        }
      };

      wsRef.current.onclose = () => {
        clearTimeout(connectionTimeout);
        setPrintServiceStatus('disconnected');
        setWsReady(false);
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connectWS, 6000);
        }
      };

      wsRef.current.onerror = (err) => {
        // Silently mark disconnected without throwing errors in console
        setPrintServiceStatus('disconnected');
      };
    };

    connectWS();

    return () => {
      isDisposed = true;
      clearTimeout(reconnectTimeout);
      clearTimeout(connectionTimeout);
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close();
        } catch (e) {}
      }
    };
  }, []);

  // Sync offline items
  const syncOfflineQueue = async () => {
    const queue = [...offlineQueue];
    let successCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const payload = queue[i];
      try {
        const response = await fetch(`${BASE_URL}/google-sheets/store-fabric-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          successCount++;
        } else {
          console.warn('Failed to sync queue item:', payload.barcodeId);
          break;
        }
      } catch (err) {
        console.error('Network error while syncing queue item:', err);
        break; 
      }
    }

    const remaining = queue.slice(successCount);
    setOfflineQueue(remaining);
    localStorage.setItem('material_offline_queue', JSON.stringify(remaining));

    if (successCount > 0) {
      showNotification(`✓ Synced ${successCount} offline records successfully!`, 'success');
    }
  };

  // Fetch sequence info from DB
  const fetchNextSequenceNumber = async () => {
    setIsLoadingSequence(true);
    try {
      const response = await fetch(`${BASE_URL}/google-sheets/next-barcode-id?type=po`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to retrieve sequence number');
      const data = await response.json();

      if (data.success && data.data) {
        const seqData = data.data;
        setNextBarcodeId(seqData.barcodeId);
        setBarcodeSequence({
          current: seqData.lastId || 0,
          next: seqData.numericId,
          lastGenerated: seqData.barcodeId
        });
      }
    } catch (error) {
      console.error('Error fetching sequential barcode id:', error);
      const fallbackSeq = Math.floor(8000000 + Math.random() * 999999);
      setNextBarcodeId(String(fallbackSeq));
    } finally {
      setIsLoadingSequence(false);
    }
  };

  // Form Validation checks
  const isFormValid = () => {
    return (
      formData.poNumber.trim() !== '' &&
      formData.cmfName.trim() !== '' &&
      formData.fabricName.trim() !== '' &&
      formData.group.trim() !== '' &&
      formData.shade.trim() !== '' &&
      formData.lotNumber.trim() !== '' &&
      formData.billNumber.trim() !== '' &&
      formData.location.trim() !== '' &&
      formData.receivedPerson.trim() !== '' &&
      formData.authorizedPerson.trim() !== ''
    );
  };

  // Update instruction banner helper
  const updateInstruction = (text, type = 'info') => {
    setUiInstruction(text);
    setInstructionType(type);
  };

  // Step progression evaluator
  const evaluateSteps = () => {
    const updated = { ...activeSteps };

    updated.step1 = isFormValid();
    updated.step2 = totalRollsInBatch > 0;
    updated.step3 = batchActive;
    updated.step4 = batchActive && manualMeters.trim() !== '';
    updated.step5 = batchActive && currentRollNumber >= totalRollsInBatch;

    setActiveSteps(updated);
  };

  useEffect(() => {
    evaluateSteps();
  }, [formData, totalRollsInBatch, batchActive, manualMeters, currentRollNumber]);

  // Submit and Sync Roll Details
  const saveRollData = async (data, rollNumber) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const API_URL = `${BASE_URL}/google-sheets/store-fabric-data`;

      const payload = {
        barcodeId: data.uniqueBarcodeId,
        batchNumber: batchNumber,
        batchDate: batchDate,
        batchTime: batchTime,
        cmfName: data.cmfName,
        fabricName: data.fabricName,
        shade: data.shade,
        lotNumber: data.lotNumber,
        group: data.group || '',
        billNumber: data.billNumber || formData.billNumber || '',
        date: data.date || new Date().toISOString().split('T')[0],
        location: data.location || '',
        receivedPerson: data.receivedPerson || '',
        authorizedPerson: data.authorizedPerson || '',
        rollNumber: rollNumber,
        batchTotal: data.totalRolls || totalRollsInBatch,
        batchStatus: 'completed',
        weight: data.weight, // manual meters value stored in weight column
        generatedAt: data.generatedAt || new Date().toLocaleTimeString(),
        timestamp: data.timestamp || new Date().toISOString(),
        status: 'in_stock',
        poNumber: data.poNumber,
        unit: 'MTR' // save as MTR
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();

      if (responseData.success && isMounted.current) {
        showNotification(`✓ Roll ${rollNumber} saved (Barcode: ${data.uniqueBarcodeId})`, 'success');
        return true;
      }
      return false;

    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`❌ OFFLINE WARNING: Saving locally. Error:`, error.message);

      const offlinePayload = {
        barcodeId: data.uniqueBarcodeId,
        batchNumber: batchNumber,
        batchDate: batchDate,
        batchTime: batchTime,
        cmfName: data.cmfName,
        fabricName: data.fabricName,
        shade: data.shade,
        lotNumber: data.lotNumber,
        group: data.group || '',
        billNumber: data.billNumber || formData.billNumber || '',
        date: data.date || new Date().toISOString().split('T')[0],
        location: data.location || '',
        receivedPerson: data.receivedPerson || '',
        authorizedPerson: data.authorizedPerson || '',
        rollNumber: rollNumber,
        batchTotal: data.totalRolls || totalRollsInBatch,
        batchStatus: 'completed',
        weight: data.weight,
        generatedAt: data.generatedAt || new Date().toLocaleTimeString(),
        timestamp: data.timestamp || new Date().toISOString(),
        status: 'in_stock',
        poNumber: data.poNumber,
        unit: 'MTR'
      };

      const updatedQueue = [...offlineQueue, offlinePayload];
      setOfflineQueue(updatedQueue);
      localStorage.setItem('material_offline_queue', JSON.stringify(updatedQueue));

      showNotification(`💾 Saved Offline (${updatedQueue.length} items pending sync)`, 'warning');
      return true;
    }
  };

  // Send Print Sticker Command via Python WebSocket Service
  const sendPrintStickerRequest = async (rollData) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      showNotification('Print service not connected. Please check if print_service.py is running.', 'error');
      return false;
    }

    try {
      wsRef.current.send(JSON.stringify({
        type: 'print',
        data: {
          cmfName: rollData.cmfName,
          fabricName: rollData.fabricName,
          group: rollData.group,
          shade: rollData.shade,
          weight: rollData.weight, // meters
          lotNumber: rollData.lotNumber,
          billNumber: rollData.billNumber,
          date: rollData.date,
          location: rollData.location,
          receivedPerson: rollData.receivedPerson,
          authorizedPerson: rollData.authorizedPerson,
          rollNumber: rollData.rollNumber,
          totalRolls: rollData.totalRolls,
          uniqueBarcodeId: rollData.uniqueBarcodeId,
          unit: 'MTR', // unit is MTR
          poNumber: rollData.poNumber
        }
      }));
      return true;
    } catch (error) {
      showNotification('Failed to send print job.', 'error');
      return false;
    }
  };

  // Manual Meters Save and Print Action
  const handleManualSaveAndPrint = async () => {
    if (!manualMeters || parseFloat(manualMeters) <= 0) {
      showNotification('Please enter a valid meters value', 'warning');
      return;
    }
    if (!isFormValid()) {
      showNotification('Please fill in all form details first', 'warning');
      return;
    }
    if (!batchActive) {
      showNotification('Please start the batch scan process first to lock details', 'warning');
      return;
    }

    const metersVal = parseFloat(manualMeters).toFixed(2);
    setIsProcessing(true);

    const rollNo = currentRollNumber + 1;
    const nextVal = barcodeSequence.next + (rollNo - 1);
    const barcodeStr = String(nextVal).padStart(6, '0');

    const rollData = {
      uniqueBarcodeId: barcodeStr,
      cmfName: formData.cmfName,
      fabricName: formData.fabricName,
      shade: formData.shade,
      lotNumber: formData.lotNumber,
      group: formData.group,
      billNumber: formData.billNumber,
      date: formData.date,
      location: formData.location,
      receivedPerson: formData.receivedPerson,
      authorizedPerson: formData.authorizedPerson,
      weight: metersVal, // Store meters in weight column
      rollNumber: rollNo,
      totalRolls: totalRollsInBatch,
      generatedAt: new Date().toLocaleTimeString(),
      timestamp: new Date().toISOString(),
      poNumber: formData.poNumber,
      unit: 'MTR'
    };

    console.log(`🏷️ Printing Roll #${rollNo} against PO: ${formData.poNumber} | Meters: ${metersVal} | Barcode: ${barcodeStr}`);

    const printSuccess = await sendPrintStickerRequest(rollData);
    const saveSuccess = await saveRollData(rollData, rollNo);

    if (saveSuccess) {
      setCompletedRolls(prev => [...prev, rollData]);
      setLastPrintedRoll(rollNo);
      setManualMeters(''); // Clear input for next roll

      if (rollNo >= totalRollsInBatch) {
        setCurrentRollNumber(totalRollsInBatch);
        updateInstruction('🎉 Batch Completed successfully!', 'success');
        showNotification('Batch completed successfully!', 'success');
        completeBatchRun();
        fetchNextSequenceNumber();
      } else {
        setCurrentRollNumber(rollNo);
        updateInstruction(`✓ Roll #${rollNo} saved. Enter meters for Roll #${rollNo + 1}`, 'info');
      }
    } else {
      updateInstruction('❌ Database sync failed. Press retry or bypass.', 'warning');
    }

    setIsProcessing(false);
  };

  // Start Batch Controls
  const startBatchProcess = () => {
    if (!isFormValid()) {
      showNotification('Please fill in all form details first', 'warning');
      return;
    }

    if (totalRollsInBatch <= 0) {
      showNotification('Please set a valid rolls quantity', 'warning');
      return;
    }

    fetchNextSequenceNumber();

    const nextBatchNo = `BTCH-${Date.now().toString().slice(-6)}`;
    setBatchNumber(nextBatchNo);
    setBatchDate(new Date().toISOString().split('T')[0]);
    setBatchTime(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    setBatchActive(true);
    setCurrentRollNumber(0);
    setCompletedRolls([]);
    setLastPrintedRoll(null);

    updateInstruction(`Batch ${nextBatchNo} active. Enter meters for Roll #1 and press ENTER or click Save.`, 'info');
  };

  // Complete Batch Controls
  const completeBatchRun = async () => {
    try {
      await fetch(`${BASE_URL}/batch/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchNumber })
      });
    } catch (e) {}

    setBatchActive(false);
    fetchNextSequenceNumber();
  };

  // Stop Batch early
  const stopBatchEarly = async () => {
    setShowStopConfirm(false);
    updateInstruction('⚠️ Batch stopped early by operator.', 'warning');
    await completeBatchRun();
    setBatchActive(false);
    showNotification('Batch stopped.', 'info');
  };

  // Reset form values
  const resetFormFields = () => {
    if (batchActive) return;

    setFormData({
      poNumber: '',
      cmfName: '',
      fabricName: '',
      group: '',
      shade: '',
      weight: '',
      lotNumber: '',
      billNumber: '',
      location: '',
      receivedPerson: loggedInUser?.name || '',
      authorizedPerson: 'Sahil Sir',
      date: new Date().toISOString().split('T')[0]
    });
    setCompletedRolls([]);
    setManualMeters('');
    updateInstruction('Form reset. Fill details to start batch again.', 'info');
  };

  const handleInputChange = (key, val) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="fabric-form-container">
      {/* Floating Active Progress Panel */}
      {batchActive && (
        <div className="batch-progress-floating-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'var(--primary-light)', padding: 8, borderRadius: 10, color: 'var(--primary)' }}>
              <Box size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: '900', color: 'var(--text-primary)' }}>Batch Progress</h3>
          </div>
          
          <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 12, marginBottom: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: '800', color: 'var(--primary)' }}>{batchNumber}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Date: {batchDate} · Time: {batchTime}</div>
          </div>

          <div style={{ background: 'var(--primary-light)', border: '1.5px dashed var(--primary)', padding: 12, borderRadius: 12, marginBottom: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: '850', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Next Barcode ID</div>
            <div style={{ fontSize: 20, fontWeight: '900', color: 'var(--text-primary)', letterSpacing: '1px', marginTop: 4, fontFamily: 'monospace' }}>{nextBarcodeId || '------'}</div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: '700', color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>Progress Tracker</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{currentRollNumber} / {totalRollsInBatch} rolls</span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: 'linear-gradient(90deg, #2563EB, #4F46E5)',
                width: `${Math.min(100, Math.max(0, (currentRollNumber / totalRollsInBatch) * 100))}%`,
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, background: 'var(--success-light)', padding: '9px 8px', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10B981', fontSize: 11, fontWeight: '800' }}>
              Done: {currentRollNumber}
            </div>
            <div style={{ flex: 1, background: 'var(--warning-light)', padding: '9px 8px', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#F59E0B', fontSize: 11, fontWeight: '800' }}>
              Left: {Math.max(0, totalRollsInBatch - currentRollNumber)}
            </div>
          </div>

          <button onClick={() => setShowStopConfirm(true)} className="btn-stop-batch-cancel" style={{ width: '100%' }}>
            <Square size={14} /> Stop & Cancel Batch
          </button>
        </div>
      )}

      {/* Enhanced Page Header with Back Button */}
      <div className="page-header">
        <div className="page-title-block">
          <button
            type="button"
            className="btn-back-nav"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <div className="breadcrumb">
              <span>Home</span><span> / </span><span>Stock Add</span><span> / </span><span style={{ color: 'var(--primary)', fontWeight: 800 }}>Material Against PO</span>
            </div>
            <h1 className="gradient-title" style={{ fontSize: '24px', margin: '2px 0 0 0' }}>
              Add Material Against PO (Linear Meters)
            </h1>
          </div>
        </div>
      </div>

      {/* System Status Indicators / Scale Status Bar */}
      <div className="scale-status-bar">
        <div className="status-indicators">
          <div className="indicator-item">
            <Printer size={16} /> Printer:
            <span className={`status-badge ${printServiceStatus === 'ready' ? 'connected' : 'error'}`}>
              <span className="live-dot" style={{ background: printServiceStatus === 'ready' ? '#10B981' : '#EF4444' }} />
              {printServiceStatus === 'ready' ? 'Ready' : 'Not Connected'}
            </span>
          </div>

          <div className="indicator-item">
            <span className={`status-badge ${isOnline ? 'connected' : 'error'}`}>
              <span className="live-dot" style={{ background: isOnline ? '#10B981' : '#EF4444' }} />
              {isCheckingNetwork ? 'Checking Network...' : isOnline ? 'Network OK' : 'Local Mode Only'}
            </span>
            {offlineQueue.length > 0 && (
              <span style={{ background: 'var(--warning-light)', color: '#F59E0B', fontSize: '10px', padding: '2px 8px', borderRadius: 10, fontWeight: '800', border: '1px solid rgba(245,158,11,0.3)' }}>
                {offlineQueue.length} queued
              </span>
            )}
          </div>
        </div>

        {notification && (
          <div className={`status-badge ${notification.type === 'success' ? 'connected' : 'connecting'}`}>
            <span className="live-dot" style={{ background: notification.type === 'success' ? '#10B981' : '#F59E0B' }} />
            <span>{notification.text}</span>
          </div>
        )}
      </div>

      {/* Guide Banner */}
      {uiInstruction && (
        <div className={`ui-instruction-box ${instructionType || 'info'}`}>
          <span style={{ fontSize: 18 }}>
            {instructionType === 'success' ? '✓' : instructionType === 'warning' ? '⚠' : 'ℹ'}
          </span>
          <span>{uiInstruction}</span>
        </div>
      )}

      {/* Form Split Layout Grid */}
      <div className="fabric-layout-grid">
        {/* Left Side Column: Manual Meters entry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Manual Meters Entry Card */}
          <div className="card premium-card">
            <div className="card-header-styled">
              <span className="card-title">Manual Meters Input</span>
              <span className="status-badge demo">Linear Meters</span>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: 18 }}>
                <label className="form-label">
                  Roll Meters Value (Mtrs) <span className="required-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Enter meters (e.g. 120.5)"
                    value={manualMeters}
                    onChange={e => setManualMeters(e.target.value)}
                    disabled={!batchActive}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleManualSaveAndPrint();
                      }
                    }}
                    className="form-control"
                    style={{
                      height: '52px',
                      fontSize: '22px',
                      fontWeight: '900',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      letterSpacing: '1px',
                      borderColor: batchActive ? 'var(--primary)' : undefined,
                      paddingRight: '60px'
                    }}
                  />
                  <span style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    fontWeight: 800, fontSize: 13, color: 'var(--text-muted)'
                  }}>MTR</span>
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                  {!batchActive ? '⚠️ Start the batch scan below to enable measurements input.' : '💡 Type meters and press ENTER to print sticker & save roll.'}
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleManualSaveAndPrint}
                  disabled={isProcessing || !batchActive || !manualMeters || parseFloat(manualMeters) <= 0}
                  className="btn-primary"
                  style={{
                    width: '100%',
                    height: '46px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderRadius: '10px',
                    fontWeight: '800',
                    fontSize: '14px',
                    cursor: (!batchActive || !manualMeters || parseFloat(manualMeters) <= 0) ? 'not-allowed' : 'pointer',
                    opacity: (!batchActive || !manualMeters || parseFloat(manualMeters) <= 0) ? 0.5 : 1
                  }}
                >
                  <Printer size={16} /> Save Roll & Print Sticker (Mtrs)
                </button>
              </div>
            </div>
          </div>

          {/* Workflow progress timeline */}
          <div className="step-tracker-card">
            <div className="card-header-styled">
              <span className="card-title">Workflow Steps</span>
            </div>
            <div className="steps-list">
              {[
                { active: activeSteps.step1, num: '1', label: 'Fill Form Details (All fields required)' },
                { active: activeSteps.step2, num: '2', label: 'Set Total Rolls quantity' },
                { active: activeSteps.step3, num: '3', label: 'Click "Start Batch" to lock details' },
                { active: activeSteps.step4, num: '4', label: 'Enter roll meters & print sticker' },
                { active: activeSteps.step5, num: '5', label: 'Complete batch' },
              ].map((step, idx) => (
                <div key={idx} className={`step-row ${step.active ? 'active' : ''}`}>
                  <div className="step-num">
                    {step.active ? '✓' : step.num}
                  </div>
                  <span className="step-label">
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Batch controls */}
          <div className="card premium-card">
            <div className="card-header-styled">
              <span className="card-title">Batch Control Panel</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label className="form-label">Total Rolls in Batch</label>
                  <input
                    type="number"
                    value={totalRollsInBatch === '' ? '' : totalRollsInBatch}
                    onChange={e => {
                      const val = e.target.value;
                      setTotalRollsInBatch(val === '' ? '' : Math.max(1, parseInt(val) || 1));
                    }}
                    disabled={batchActive}
                    className="form-control"
                    style={{ fontWeight: 700 }}
                  />
                </div>

                {!batchActive ? (
                  <button
                    type="button"
                    onClick={startBatchProcess}
                    disabled={!isFormValid()}
                    className="btn-success"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '0 20px', borderRadius: 8, height: '38px',
                      fontWeight: 800, fontSize: '13px', cursor: isFormValid() ? 'pointer' : 'not-allowed',
                      opacity: isFormValid() ? 1 : 0.6
                    }}
                  >
                    <Play size={14} /> Start Batch
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowStopConfirm(true)}
                    className="btn-danger"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '0 20px', borderRadius: 8, height: '38px',
                      fontWeight: 800, fontSize: '13px', cursor: 'pointer'
                    }}
                  >
                    <Square size={14} /> Stop Batch
                  </button>
                )}

                <button
                  type="button"
                  onClick={resetFormFields}
                  disabled={batchActive}
                  className="btn-secondary"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '0 16px', borderRadius: 8, height: '38px',
                    fontWeight: 800, fontSize: '13px', cursor: batchActive ? 'not-allowed' : 'pointer',
                    opacity: batchActive ? 0.6 : 1
                  }}
                >
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
            </div>
          </div>

          {/* Form details card */}
          <div className="card premium-card">
            <div className="card-header-styled">
              <span className="card-title">Roll Metadata Details</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label className="form-label">PO Number <span className="required-star">*</span></label>
                      <input
                        value={formData.poNumber}
                        onChange={e => handleInputChange('poNumber', e.target.value)}
                        disabled={batchActive}
                        placeholder="e.g. PO-20251028-5328"
                        className="form-control"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={fetchPoDetailsFromSheet}
                      disabled={batchActive || isFetchingPo}
                      className="btn-primary"
                      style={{
                        padding: '0 18px', borderRadius: 8, height: '38px',
                        fontWeight: 800, fontSize: '12px', cursor: 'pointer'
                      }}
                    >
                      {isFetchingPo ? 'Fetching...' : 'Fetch Details'}
                    </button>
                  </div>

                  {poItems.length > 0 && (
                    <div style={{
                      background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 12,
                      padding: 14, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 10
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: '850', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Items Found in PO ({poItems.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                        {poItems.map((item, index) => {
                          const isSelected = formData.fabricName === item.description;
                          return (
                            <div
                              key={index}
                              onClick={() => !batchActive && handleSelectPoItem(item)}
                              style={{
                                padding: '8px 12px', borderRadius: 8,
                                border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                                background: isSelected ? 'var(--primary-light)' : 'var(--surface)',
                                cursor: batchActive ? 'not-allowed' : 'pointer',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s'
                              }}
                            >
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ fontSize: '12.5px', fontWeight: '800', color: 'var(--text-primary)' }}>{item.description}</div>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: 2 }}>Line #{item.lineNo} · {item.department}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '12.5px', fontWeight: '900', color: 'var(--primary)' }}>{item.qty} {item.uom}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">CMP Name <span className="required-star">*</span></label>
                    <input
                      value={formData.cmfName}
                      onChange={e => handleInputChange('cmfName', e.target.value)}
                      disabled={batchActive}
                      placeholder="e.g. CMF-Fabric"
                      className="form-control"
                    />
                  </div>
                  <div>
                    <label className="form-label">Fabric Name <span className="required-star">*</span></label>
                    <input
                      value={formData.fabricName}
                      onChange={e => handleInputChange('fabricName', e.target.value)}
                      disabled={batchActive}
                      placeholder="e.g. Cotton 30s"
                      className="form-control"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Group <span className="required-star">*</span></label>
                    <input
                      value={formData.group}
                      onChange={e => handleInputChange('group', e.target.value)}
                      disabled={batchActive}
                      placeholder="e.g. Knitted"
                      className="form-control"
                    />
                  </div>
                  <div>
                    <label className="form-label">Shade <span className="required-star">*</span></label>
                    <input
                      value={formData.shade}
                      onChange={e => handleInputChange('shade', e.target.value)}
                      disabled={batchActive}
                      placeholder="e.g. Navy Blue"
                      className="form-control"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Lot Number <span className="required-star">*</span></label>
                    <input
                      value={formData.lotNumber}
                      onChange={e => handleInputChange('lotNumber', e.target.value)}
                      disabled={batchActive}
                      placeholder="e.g. LOT-4509"
                      className="form-control"
                    />
                  </div>
                  <div>
                    <label className="form-label">Bill Number <span className="required-star">*</span></label>
                    <input
                      value={formData.billNumber}
                      onChange={e => handleInputChange('billNumber', e.target.value)}
                      disabled={batchActive}
                      placeholder="e.g. BILL-9921"
                      className="form-control"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Date <span className="required-star">*</span></label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={e => handleInputChange('date', e.target.value)}
                      disabled={batchActive}
                      className="form-control"
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Location <span className="required-star">*</span></label>
                  <LocationPicker
                    value={formData.location}
                    onChange={val => handleInputChange('location', val)}
                    disabled={batchActive}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Received Person <span className="required-star">*</span></label>
                    <input
                      value={formData.receivedPerson}
                      onChange={e => handleInputChange('receivedPerson', e.target.value)}
                      disabled={batchActive}
                      placeholder="e.g. John Doe"
                      className="form-control"
                    />
                  </div>
                  <div>
                    <label className="form-label">Authorized Person <span className="required-star">*</span></label>
                    <input
                      value={formData.authorizedPerson}
                      onChange={e => handleInputChange('authorizedPerson', e.target.value)}
                      disabled={batchActive}
                      placeholder="e.g. Sarah Smith"
                      className="form-control"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Processing and Sticker preview */}
          {isProcessing && (
            <div style={{
              position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
              background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)', zIndex: 1000,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
              color: '#fff'
            }}>
              <Printer size={32} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontWeight: '800', fontSize: '15px' }}>Generating sticker and syncing to database...</span>
            </div>
          )}

          {/* Scanned / Printed roll history table inside batch */}
          {completedRolls.length > 0 && (
            <div className="card premium-card" style={{ marginTop: 8, overflow: 'hidden' }}>
              <div className="card-header-styled">
                <span className="card-title">
                  Sticker Barcodes Printed in this Batch ({completedRolls.length})
                </span>
              </div>
              <div className="table-responsive" style={{ overflowX: 'auto' }}>
                <table className="custom-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Roll #</th>
                      <th>Barcode ID</th>
                      <th>Fabric Name</th>
                      <th>Length</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRolls.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 800 }}>#{r.rollNumber}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>{r.uniqueBarcodeId}</td>
                        <td style={{ fontWeight: 600 }}>{r.fabricName} ({r.shade})</td>
                        <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{r.weight} MTR</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{r.generatedAt}</td>
                        <td>
                          <span className="lot-pill">✓ Synced</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stop Confirmation Dialog */}
      {showStopConfirm && (
        <div style={{
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div className="card premium-card" style={{
            padding: 28, maxWidth: 440, width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div style={{ background: 'var(--danger-light)', padding: 8, borderRadius: 10, color: 'var(--danger)' }}>
                <AlertTriangle size={24} />
              </div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: '900', color: 'var(--text-primary)' }}>Stop Batch Process?</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: 1.5, margin: '0 0 24px 0' }}>
              You have printed <strong>{currentRollNumber}</strong> rolls of <strong>{totalRollsInBatch}</strong> planned. Stop early and cancel remaining?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowStopConfirm(false)}
                className="btn-secondary"
                style={{ padding: '8px 18px', borderRadius: 8, fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
              >
                Go Back
              </button>
              <button
                onClick={stopBatchEarly}
                className="btn-danger"
                style={{ padding: '8px 18px', borderRadius: 8, fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
              >
                Yes, Stop Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide in styles */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(50px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default MaterialAgainstPoForm;

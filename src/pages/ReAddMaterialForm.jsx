import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, BASE_URL } from '../store.js';
import LocationPicker from '../components/LocationPicker.jsx';
import {
  Printer, Play, Square, RotateCcw,
  CheckCircle2, AlertTriangle, AlertCircle,
  X, CheckCircle, PackagePlus, Eye, Save,
  Box, Hourglass, ArrowLeft
} from 'lucide-react';
import '../Design/FabricStickerForm.css';

const ReAddMaterialForm = () => {
  const navigate = useNavigate();

  // Get logged in user data
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Main Form Data
  const [formData, setFormData] = useState({
    cmfName: '',
    fabricName: '',
    group: '',
    shade: '',
    weight: '',
    lotNumber: '',
    billNumber: '',
    location: '',
    receivedPerson: '',
    authorizedPerson: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Manual weight input state
  const [manualWeight, setManualWeight] = useState('');

  // Batch processing states
  const [totalRollsInBatch, setTotalRollsInBatch] = useState(1);
  const [currentRollNumber, setCurrentRollNumber] = useState(0);
  const [completedRolls, setCompletedRolls] = useState([]);
  const [batchInfo, setBatchInfo] = useState(null);
  const [batchActive, setBatchActive] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const [submittedData, setSubmittedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPrintedRoll, setLastPrintedRoll] = useState(null);

  // UI Instructions
  const [uiInstruction, setUiInstruction] = useState('Fill form details to begin');
  const [instructionType, setInstructionType] = useState('info');

  // Step indicators state
  const [activeSteps, setActiveSteps] = useState({
    step1: false, // Fill Form Details
    step2: false, // Set Total Rolls
    step3: false, // Start Batch
    step4: false, // Enter Weight & Print
    step5: false  // Complete
  });

  // Batch info details
  const [batchNumber, setBatchNumber] = useState('');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchTime, setBatchTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  // Sequential barcode tracking
  const [nextBarcodeId, setNextBarcodeId] = useState(null);
  const [barcodeSequence, setBarcodeSequence] = useState({
    current: 0,
    next: 300001,
    lastGenerated: null
  });
  const [isLoadingSequence, setIsLoadingSequence] = useState(true);

  // Print service states
  const [printServiceStatus, setPrintServiceStatus] = useState('connecting');
  const [printQueueLength, setPrintQueueLength] = useState(0);
  const [lastPrintStatus, setLastPrintStatus] = useState(null);
  const [wsReady, setWsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // ── Network / Backend health ─────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(true);          // green = true, red = false
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState([]);     // prints waiting for network
  const networkIntervalRef = useRef(null);
  const offlineQueueRef = useRef([]);                       // sync ref for async access
  const timeIntervalRef = useRef(null);

  // WebSocket reference
  const wsRef = useRef(null);
  const isMounted = useRef(true);

  // ── Keep offlineQueueRef in sync with state ──────────────────────────
  useEffect(() => {
    offlineQueueRef.current = offlineQueue;
  }, [offlineQueue]);

  // ── Notification helper ──────────────────────────────────────────────
  const showNotification = (msg, type = 'info') => {
    const notifyArea = document.getElementById('notification-area');
    if (!notifyArea) return;

    const banner = document.createElement('div');
    banner.className = `notification-banner ${type}`;
    banner.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};
      color: white;
      font-weight: 700;
      border-radius: 12px;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
      margin-bottom: 10px;
      animation: slideIn 0.3s ease-out forwards;
      font-size: 14px;
    `;

    const icon = document.createElement('span');
    icon.innerHTML = type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ';
    icon.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      font-size: 14px;
    `;

    const text = document.createElement('span');
    text.innerText = msg;
    text.style.flex = '1';

    banner.appendChild(icon);
    banner.appendChild(text);
    notifyArea.appendChild(banner);

    setTimeout(() => {
      banner.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => banner.remove(), 300);
    }, 4000);
  };

  const updateInstruction = (msg, type = 'info') => {
    setUiInstruction(msg);
    setInstructionType(type);
  };

  // Load next barcode ID from MySQL
  async function loadNextBarcodeId() {
    try {
      setIsLoadingSequence(true);
      const response = await fetch(`${BASE_URL}/re-add-material/next-barcode-id?t=${Date.now()}`);
      const data = await response.json();
      if (data.success && data.data && isMounted.current) {
        const { barcodeId, numericId, lastId } = data.data;
        setNextBarcodeId(barcodeId);
        setBarcodeSequence({
          current: lastId || 0,
          next: numericId,
          lastGenerated: barcodeId
        });
        console.log(`📋 Loaded next barcode ID: ${barcodeId} (Sequence: ${numericId})`);
      }
    } catch (error) {
      console.error('Error fetching barcode sequence:', error);
      showNotification(`Failed to fetch next barcode: ${error.message}`, 'error');
    } finally {
      if (isMounted.current) setIsLoadingSequence(false);
    }
  }

  // WebSocket Connection
  function connectToPrintService() {
    const wsHost = '127.0.0.1';
    const WS_URL = `ws://${wsHost}:8765`;

    console.log('🔌 Connecting to print service at:', WS_URL);

    const connectionTimeout = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('❌ Connection timeout after 5 seconds');
        if (isMounted.current) {
          setPrintServiceStatus('error');
          setErrorMessage('Connection timeout - print service not responding');
          updateInstruction('❌ Print service connection timeout. Make sure print_service.py is running.', 'error');
        }
      }
    }, 5000);

    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('✅ WebSocket connection established');
        if (isMounted.current) {
          setPrintServiceStatus('connected');
          updateInstruction('✅ Connected to print service!', 'success');
          showNotification('Print service connected successfully!', 'success');
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'auth',
            token: 'fabric-print-secret-key-2024'
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        if (!isMounted.current) return;

        try {
          const response = JSON.parse(event.data);

          switch (response.type) {
            case 'auth_success':
              setPrintServiceStatus('ready');
              setWsReady(true);
              showNotification('✓ Print service ready!', 'success');
              updateInstruction('✅ Print service ready! Start a batch to begin', 'success');
              break;

            case 'auth_failed':
              setPrintServiceStatus('error');
              setWsReady(false);
              setErrorMessage('Print service authentication failed');
              showNotification('❌ Print service auth failed!', 'error');
              break;

            case 'print_result':
              if (response.success) {
                setLastPrintStatus({ success: true, message: response.message });
                showNotification(`✓ Sticker printed successfully!`, 'success');
              } else {
                setLastPrintStatus({ success: false, message: response.message });
                showNotification(`✗ Print failed: ${response.message}`, 'error');
              }
              break;

            case 'status':
              setPrintQueueLength(response.queue_length || 0);
              break;

            case 'error':
              showNotification(`Error: ${response.message}`, 'error');
              break;

            default:
              console.log('Unknown message type:', response);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        clearTimeout(connectionTimeout);
        if (isMounted.current) {
          setPrintServiceStatus('error');
          setWsReady(false);
          setErrorMessage(`WebSocket error: Connection failed`);
          updateInstruction('❌ Cannot connect to print service. Make sure print_service.py is running on port 8765', 'error');
          showNotification('⚠️ Print service offline! Run: python print_service.py', 'error');
        }
      };

      wsRef.current.onclose = (event) => {
        clearTimeout(connectionTimeout);
        if (isMounted.current) {
          setPrintServiceStatus('disconnected');
          setWsReady(false);
          updateInstruction('⚠️ Print service disconnected. Run: python print_service.py', 'warning');
        }

        setTimeout(() => {
          if (isMounted.current && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
            console.log('🔄 Attempting to reconnect...');
            connectToPrintService();
          }
        }, 5000);
      };

    } catch (error) {
      clearTimeout(connectionTimeout);
      if (isMounted.current) {
        setPrintServiceStatus('error');
        setWsReady(false);
        showNotification('Failed to connect to print service', 'error');
      }
    }
  }

  function printViaPythonService(stickerData) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      showNotification('Print service not connected. Please check if service is running.', 'error');
      return false;
    }

    if (printServiceStatus !== 'ready') {
      showNotification('Print service not ready. Please wait for connection.', 'error');
      return false;
    }

    try {
      wsRef.current.send(JSON.stringify({
        type: 'print',
        data: stickerData
      }));
      return true;
    } catch (error) {
      showNotification('Failed to send print job.', 'error');
      return false;
    }
  }

  // Network health check
  useEffect(() => {
    const checkNetwork = async () => {
      if (!isMounted.current) return;
      setIsCheckingNetwork(true);
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
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
        clearTimeout(tid);
        if (!isMounted.current) return;

        if (!isOnline) {
          setIsOnline(true);
          showNotification('✅ Network restored! Processing queued prints...', 'success');

          // Flush offline queue
          const queue = [...offlineQueueRef.current];
          if (queue.length > 0) {
            updateInstruction('⚡ Processing queued offline prints...', 'info');
            for (const item of queue) {
              try {
                await storeDataInGoogleSheets(item.stickerData, item.rollNumber);
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && printServiceStatus === 'ready') {
                  printViaPythonService(item.stickerData);
                }
              } catch (e) {
                console.error('Failed to sync offline print job', e);
              }
            }
            setOfflineQueue([]);
            offlineQueueRef.current = [];
            showNotification('✅ All offline prints synced successfully!', 'success');
          }
        }
      } catch (err) {
        if (!isMounted.current) return;
        if (isOnline) {
          setIsOnline(false);
          showNotification('⚠️ Network disconnected! Entering offline queue mode.', 'error');
          updateInstruction('⚠️ Network disconnected! System will queue rolls locally.', 'error');
        }
      } finally {
        if (isMounted.current) setIsCheckingNetwork(false);
      }
    };

    checkNetwork();
    networkIntervalRef.current = setInterval(checkNetwork, 10000);

    return () => {
      if (networkIntervalRef.current) clearInterval(networkIntervalRef.current);
    };
  }, [isOnline]);

  // Handle document title & user load
  useEffect(() => {
    document.title = "Re Add Material | TWMS";
    
    // Set user
    const u = localStorage.getItem('twms_user');
    if (u) {
      try {
        setLoggedInUser(JSON.parse(u));
      } catch (e) {
        console.error(e);
      }
    }

    // Keep active step updated based on form details
    const isStep1Done = !!(
      formData.cmfName.trim() &&
      formData.fabricName.trim() &&
      formData.group.trim() &&
      formData.shade.trim() &&
      formData.lotNumber.trim() &&
      formData.location.trim()
    );

    setActiveSteps(prev => ({
      ...prev,
      step1: isStep1Done,
      step2: isStep1Done && totalRollsInBatch >= 1
    }));
  }, [formData, totalRollsInBatch]);

  useEffect(() => {
    isMounted.current = true;
    loadNextBarcodeId();
    connectToPrintService();

    // Start time interval
    timeIntervalRef.current = setInterval(() => {
      if (!batchActive) {
        const t = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setBatchTime(t);
      }
    }, 1000);

    return () => {
      isMounted.current = false;
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Check if form is valid
  const isFormValid = () => {
    return (
      formData.cmfName.trim() !== '' &&
      formData.fabricName.trim() !== '' &&
      formData.group.trim() !== '' &&
      formData.shade.trim() !== '' &&
      formData.lotNumber.trim() !== '' &&
      formData.location.trim() !== ''
    );
  };

  // Action: Start Batch
  const startBatchProcess = async () => {
    if (!isFormValid()) {
      showNotification('Please fill in all required form details (with asterisk *)', 'error');
      updateInstruction('❌ Missing details. Please fill all fields.', 'error');
      return;
    }

    if (!totalRollsInBatch || totalRollsInBatch < 1) {
      showNotification('Please set a valid roll quantity', 'error');
      return;
    }

    try {
      updateInstruction('Starting batch. Loading sequence...', 'info');
      await loadNextBarcodeId();

      const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = new Date().toISOString().split('T')[0];

      setBatchNumber(`B-${formData.lotNumber}-${date.replace(/-/g, '')}`);
      setBatchDate(date);
      setBatchTime(time);
      setBatchInfo({ ...formData });

      setBatchActive(true);
      setCurrentRollNumber(0);
      setCompletedRolls([]);
      setManualWeight('');

      setActiveSteps(prev => ({
        ...prev,
        step3: true,
        step4: true
      }));

      showNotification('⚡ Batch Started successfully!', 'success');
      updateInstruction('👉 Enter roll weight manually & click Print to save', 'success');

    } catch (e) {
      console.error(e);
      showNotification('Failed to start batch', 'error');
    }
  };

  const getNextSequentialBarcodeId = async () => {
    try {
      const response = await fetch(`${BASE_URL}/re-add-material/next-barcode-id?t=${Date.now()}`);
      const resData = await response.json();
      if (resData.success && resData.data) {
        return resData.data.barcodeId;
      }
    } catch (err) {
      console.error('Error fetching barcode sequential ID:', err);
    }
    // local incremental fallback if server fails
    const currentSeqId = barcodeSequence.next + completedRolls.length;
    return String(currentSeqId);
  };

  // Action: Store to Database
  const storeDataInGoogleSheets = async (stickerData, rollNo) => {
    try {
      const payload = {
        barcodeId: stickerData.uniqueBarcodeId,
        cmfName: stickerData.cmfName,
        fabricName: stickerData.fabricName,
        lotNumber: stickerData.lotNumber,
        group: stickerData.group,
        shade: stickerData.shade,
        billNumber: stickerData.billNumber,
        date: stickerData.date,
        location: stickerData.location,
        receivedPerson: stickerData.receivedPerson || loggedInUser?.name || 'System',
        authorizedPerson: stickerData.authorizedPerson || loggedInUser?.name || 'System',
        rollNumber: rollNo,
        batchTotal: totalRollsInBatch,
        weight: parseFloat(stickerData.weight) || 0.00,
        batchStatus: rollNo === totalRollsInBatch ? 'completed' : 'processing',
        generatedAt: stickerData.generatedAt,
        timestamp: stickerData.timestamp,
        batchNumber: batchNumber,
        batchDate: batchDate,
        batchTime: batchTime
      };

      const res = await fetch(`${BASE_URL}/re-add-material/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) {
        console.error('❌ Save failed response:', data);
        showNotification(data.message || data.error || 'Database save failed', 'error');
      }
      return data.success;
    } catch (e) {
      console.error('Failed to save to backend MySQL database:', e);
      showNotification('Failed to connect to backend server', 'error');
      return false;
    }
  };

  const logBatchCompletion = async (totalRolls) => {
    try {
      await fetch(`${BASE_URL}/re-add-material/complete-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchNumber,
          lotNumber: batchInfo?.lotNumber || '',
          totalRolls: totalRollsInBatch,
          processedRolls: totalRolls,
          completedBy: loggedInUser?.name || 'System'
        })
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Trigger manual weight print & save
  const handleManualPrintAndSave = async () => {
    const weightNum = parseFloat(manualWeight);
    if (isNaN(weightNum) || weightNum < 0.1) {
      showNotification('Please enter a valid weight (minimum 0.1 KG)', 'error');
      return;
    }

    if (currentRollNumber >= totalRollsInBatch) {
      showNotification('All rolls in this batch have already been processed.', 'warning');
      return;
    }

    try {
      updateInstruction(`🖨️ Printing roll ${currentRollNumber + 1}...`, 'info');
      const barcodeId = await getNextSequentialBarcodeId();
      const currentTime = new Date();
      const timeString = currentTime.toLocaleTimeString();
      const dateString = currentTime.toISOString().split('T')[0];

      const stickerData = {
        cmfName: batchInfo.cmfName,
        fabricName: batchInfo.fabricName,
        group: batchInfo.group,
        shade: batchInfo.shade,
        weight: manualWeight,
        lotNumber: batchInfo.lotNumber,
        billNumber: batchInfo.billNumber,
        date: batchInfo.date || dateString,
        location: batchInfo.location,
        receivedPerson: batchInfo.receivedPerson,
        authorizedPerson: batchInfo.authorizedPerson,
        rollNumber: currentRollNumber + 1,
        totalRolls: totalRollsInBatch,
        uniqueBarcodeId: barcodeId,
        generatedAt: timeString,
        timestamp: currentTime.toISOString(),
        status: 'in_stock'
      };

      if (!isOnline) {
        const queuedJob = { stickerData, rollNumber: currentRollNumber + 1 };
        setOfflineQueue(prev => [...prev, queuedJob]);
        showNotification(`🔴 Offline - Roll ${currentRollNumber + 1} queued. Syncing later.`, 'warning');
        updateInstruction('🔴 Offline! Roll weight queued locally.', 'warning');

        setCompletedRolls(prev => [...prev, {
          rollNumber: currentRollNumber + 1,
          weight: manualWeight,
          barcodeId: barcodeId,
          timestamp: timeString,
          fabricName: batchInfo.fabricName,
          shade: batchInfo.shade,
          queued: true
        }]);

        const newRollNumber = currentRollNumber + 1;
        setCurrentRollNumber(newRollNumber);
        loadNextBarcodeId();
        setManualWeight('');

        if (newRollNumber >= totalRollsInBatch) {
          setBatchActive(false);
          updateInstruction('🔴 Batch complete (offline mode). Syncing when online.', 'warning');
          setActiveSteps(prev => ({ ...prev, step5: true }));
        }
        return;
      }

      const stored = await storeDataInGoogleSheets(stickerData, currentRollNumber + 1);

      if (stored) {
        setSubmittedData(stickerData);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && printServiceStatus === 'ready') {
          printViaPythonService(stickerData);
          showNotification(`✓ Roll ${currentRollNumber + 1} sticker printed successfully!`, 'success');
          updateInstruction(`✅ Roll ${currentRollNumber + 1} printed!`, 'success');
        } else {
          showNotification('⚠️ Roll saved to database, but print service is offline', 'warning');
        }

        setCompletedRolls(prev => [...prev, {
          rollNumber: currentRollNumber + 1,
          weight: manualWeight,
          barcodeId: barcodeId,
          timestamp: timeString,
          fabricName: batchInfo.fabricName,
          shade: batchInfo.shade
        }]);

        const newRollNumber = currentRollNumber + 1;
        setCurrentRollNumber(newRollNumber);
        setLastPrintedRoll(newRollNumber);
        loadNextBarcodeId();
        setManualWeight('');

        if (newRollNumber >= totalRollsInBatch) {
          showNotification(`🎉 Batch complete!`, 'success');
          setBatchActive(false);
          await logBatchCompletion(newRollNumber);
          updateInstruction('🎉 Batch completed! Start a new batch to continue', 'success');
          setActiveSteps(prev => ({ ...prev, step5: true }));
        } else {
          showNotification(`✅ Roll ${newRollNumber} saved!`, 'success');
          updateInstruction(`✅ Roll ${newRollNumber} printed! Enter weight for roll ${newRollNumber + 1}`, 'success');
        }
      } else {
        showNotification('Database save failed. Please check backend connection.', 'error');
      }
    } catch (error) {
      console.error(error);
      showNotification('Print and save failed.', 'error');
    }
  };

  // Action: Stop Batch early
  const stopBatchEarly = async () => {
    setShowStopConfirm(false);
    if (!batchActive) return;

    try {
      if (currentRollNumber > 0) {
        await logBatchCompletion(currentRollNumber);
      }
      setBatchActive(false);
      showNotification('🔴 Batch stopped early.', 'warning');
      updateInstruction('🔴 Batch stopped early by operator', 'warning');
      loadNextBarcodeId();
    } catch (e) {
      console.error(e);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLocationSelect = (loc) => {
    setFormData(prev => ({
      ...prev,
      location: loc
    }));
  };

  return (
    <div className="fabric-form-container">
      {/* Dynamic Notifications area */}
      <div id="notification-area" className="notification-area" />

      {/* Enhanced Page Header with Back Button */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="page-title-block" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            className="btn-back-nav"
            onClick={() => navigate(-1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1.5px solid var(--border, #CBD5E1)',
              background: 'var(--surface, #FFFFFF)',
              color: 'var(--text-primary, #0F172A)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              transition: 'all 0.2s'
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <div className="breadcrumb" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700 }}>
              <span>Home</span><span>/</span><span>Stock Add</span><span>/</span><span style={{ color: 'var(--primary, #2563EB)' }}>Material Re-Add</span>
            </div>
            <h1 className="gradient-title" style={{ margin: '2px 0 0 0', fontSize: '24px' }}>
              Re-Add Material In Stock
            </h1>
            <p style={{ margin: '3px 0 0 0', color: 'var(--text-muted, #64748B)', fontSize: '12.5px' }}>
              Re-inward returned or surplus fabric rolls back into warehouse stock with fresh barcode tags.
            </p>
          </div>
        </div>
      </div>

      {/* Connection and Instruction Banner */}
      <div className="scale-status-bar">
        <div className="status-indicators">
          <div className="indicator-item">
            <Printer size={16} /> Printer:
            <span className={`status-badge ${printServiceStatus === 'ready' ? 'connected' : printServiceStatus}`}>
              {printServiceStatus}
            </span>
          </div>

          {/* Network / Backend Status Light */}
          <div className="indicator-item net-status-item">
            <span
              className={`net-light ${isOnline ? 'net-online' : 'net-offline'} ${isCheckingNetwork ? 'net-checking' : ''}`}
              title={isOnline ? 'Network OK — Backend connected' : 'No network — Backend unreachable'}
            />
            <span className={`net-label ${isOnline ? 'net-label-online' : 'net-label-offline'}`}>
              {isCheckingNetwork
                ? 'Checking...'
                : isOnline
                  ? 'Network OK'
                  : 'No Network'}
            </span>
            {offlineQueue.length > 0 && (
              <span className="net-queue-badge">{offlineQueue.length} queued</span>
            )}
          </div>
        </div>

        {uiInstruction && (
          <div className={`ui-instruction-box ${instructionType}`}>
            <span>{uiInstruction}</span>
          </div>
        )}
      </div>

      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="offline-banner">
          <span className="offline-banner-dot" />
          <div className="offline-banner-text">
            <strong>No Network — Waiting for connection...</strong>
            <span>
              {offlineQueue.length > 0
                ? `${offlineQueue.length} roll(s) queued. They will be saved automatically when network returns.`
                : 'Saving is paused. Everything will resume automatically once network is restored.'}
            </span>
          </div>
        </div>
      )}

      {isOnline && offlineQueue.length > 0 && (
        <div className="online-queue-banner">
          <span className="online-queue-dot" />
          <strong>Network restored!</strong>
          <span>Syncing {offlineQueue.length} queued roll(s)...</span>
        </div>
      )}

      <div className="fabric-layout-grid">
        {/* Left Side: Manual Entry & Workflow Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Live Weight Dashboard */}
          <div className="weight-card connected" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="weight-label">ROLL WEIGHT MANUAL ENTRY</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '15px 0' }}>
              <input
                type="number"
                value={manualWeight}
                onChange={(e) => setManualWeight(e.target.value)}
                placeholder="0.00"
                className="manual-weight-input-field"
                disabled={!batchActive}
              />
              <span className="weight-unit" style={{ color: 'white', opacity: 0.9, marginLeft: 10 }}>KG</span>
            </div>

            {batchActive && (
              <button
                className="btn btn-success btn-lg"
                style={{
                  width: '100%',
                  marginTop: 15,
                  background: '#10b981',
                  border: 'none',
                  color: 'white',
                  fontWeight: '700',
                  boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  height: '45px',
                  borderRadius: '8px',
                  opacity: (!manualWeight || parseFloat(manualWeight) < 0.1 || !nextBarcodeId || nextBarcodeId === '------') ? 0.5 : 1,
                  pointerEvents: (!manualWeight || parseFloat(manualWeight) < 0.1 || !nextBarcodeId || nextBarcodeId === '------') ? 'none' : 'auto'
                }}
                onClick={handleManualPrintAndSave}
                disabled={!manualWeight || parseFloat(manualWeight) < 0.1 || !nextBarcodeId || nextBarcodeId === '------'}
              >
                <Printer size={18} /> Print Sticker & Save Roll
              </button>
            )}

            <div className="printer-status-bar" style={{ marginTop: 5, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
              <span>Printer Status:</span>
              <span className={`status-val ${printServiceStatus}`} style={{ fontWeight: 700 }}>
                {printServiceStatus.toUpperCase()}
              </span>
              <span className="ping-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: wsReady ? '#10b981' : '#f59e0b' }} />
            </div>
          </div>

          {/* Workflow Steps Tracker */}
          <div className="step-tracker-card">
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="card-title" style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Workflow Steps</div>
            </div>
            <div className="steps-list">
              <div className={`step-row ${activeSteps.step1 ? 'completed' : 'active'}`}>
                <div className="step-num">{activeSteps.step1 ? '✓' : '1'}</div>
                <div className="step-label">Fill Form Details (All fields are required)</div>
              </div>
              <div className={`step-row ${activeSteps.step1 && !activeSteps.step2 ? 'active' : activeSteps.step2 ? 'completed' : ''}`}>
                <div className="step-num">{activeSteps.step2 ? '✓' : '2'}</div>
                <div className="step-label">Set Total Rolls quantity ({totalRollsInBatch})</div>
              </div>
              <div className={`step-row ${activeSteps.step2 && !activeSteps.step3 ? 'active' : activeSteps.step3 ? 'completed' : ''}`}>
                <div className="step-num">{activeSteps.step3 ? '✓' : '3'}</div>
                <div className="step-label">Click "Start Batch" to lock details</div>
              </div>
              <div className={`step-row ${activeSteps.step3 && !activeSteps.step4 ? 'active' : activeSteps.step4 ? 'completed' : ''}`}>
                <div className="step-num">{activeSteps.step4 ? '✓' : '4'}</div>
                <div className="step-label">Enter roll weight manually & print ({currentRollNumber + 1} of {totalRollsInBatch})</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Form details Card */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="card-title">Roll Entry & Metadata Details</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="compact-form-row">
              <div className="form-group">
                <label className="form-label">Total Rolls in Batch</label>
                <input
                  type="number"
                  value={totalRollsInBatch}
                  onChange={(e) => setTotalRollsInBatch(Math.max(1, parseInt(e.target.value) || 1))}
                  className="form-control"
                  disabled={batchActive}
                />
              </div>

              <div className="form-group">
                <label className="form-label">CMP Name <span className="required-star">*</span></label>
                <input
                  type="text"
                  name="cmfName"
                  value={formData.cmfName}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Supplier/CMP Name"
                  disabled={batchActive}
                />
              </div>
            </div>

            <div className="compact-form-row">
              <div className="form-group">
                <label className="form-label">Fabric Name <span className="required-star">*</span></label>
                <input
                  type="text"
                  name="fabricName"
                  value={formData.fabricName}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Fabric Type"
                  disabled={batchActive}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Group Name <span className="required-star">*</span></label>
                <input
                  type="text"
                  name="group"
                  value={formData.group}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="GSM/Group info"
                  disabled={batchActive}
                />
              </div>
            </div>

            <div className="compact-form-row">
              <div className="form-group">
                <label className="form-label">Shade Code <span className="required-star">*</span></label>
                <input
                  type="text"
                  name="shade"
                  value={formData.shade}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="e.g. Navy Blue"
                  disabled={batchActive}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Lot Number <span className="required-star">*</span></label>
                <input
                  type="text"
                  name="lotNumber"
                  value={formData.lotNumber}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Dyeing Lot No"
                  disabled={batchActive}
                />
              </div>
            </div>

            <div className="compact-form-row">
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Bill Number / Invoice No</label>
                <input
                  type="text"
                  name="billNumber"
                  value={formData.billNumber}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Optional Invoice/Bill No."
                  disabled={batchActive}
                />
              </div>
            </div>

            <div className="compact-form-row">
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Storage Location (Rack/Row) <span className="required-star">*</span></label>
                <LocationPicker
                  value={formData.location}
                  onChange={handleLocationSelect}
                  disabled={batchActive}
                />
              </div>
            </div>

            <div className="compact-form-row">
              <div className="form-group">
                <label className="form-label">Received By</label>
                <input
                  type="text"
                  name="receivedPerson"
                  value={formData.receivedPerson || loggedInUser?.name || ''}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Operator Name"
                  disabled={batchActive}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Authorized By</label>
                <input
                  type="text"
                  name="authorizedPerson"
                  value={formData.authorizedPerson || loggedInUser?.name || ''}
                  onChange={handleFormChange}
                  className="form-control"
                  placeholder="Supervisor Name"
                  disabled={batchActive}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
              {!batchActive ? (
                <button
                  type="button"
                  onClick={startBatchProcess}
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Play size={16} />
                  <span>Start Manual Weight Batch Process</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowStopConfirm(true)}
                  className="btn btn-danger btn-lg"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flex: 1 }}
                >
                  <Square size={16} />
                  <span>Stop Batch Early</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Batch progress modal widget */}
      {batchActive && (
        <div className="batch-progress-floating-card">
          <div className="batch-progress-header">
            <Box size={18} className="batch-box-icon" />
            <h3>Batch Progress</h3>
          </div>
          <div className="batch-progress-body">
            <div className="batch-id-banner">
              <div className="batch-num">{batchNumber}</div>
              <div className="batch-time-info">
                Date: {batchDate} | Time: {batchTime}
              </div>
            </div>

            <div className="next-barcode-card">
              <div className="next-barcode-title">Next Barcode ID</div>
              <div className="next-barcode-value">{nextBarcodeId || '------'}</div>
              <div className="next-barcode-seq">Sequential #{nextBarcodeId || '------'}</div>
              {(!nextBarcodeId || nextBarcodeId === '------') && (
                <button
                  type="button"
                  onClick={loadNextBarcodeId}
                  style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    padding: '4px 8px',
                    background: '#ea580c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Load Barcode ID
                </button>
              )}
            </div>

            <div className="progress-section">
              <div className="progress-header">
                <span className="progress-title">Progress</span>
                <span className="progress-count">{currentRollNumber} of {totalRollsInBatch} rolls</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-thumb"
                  style={{ width: `${Math.min(100, Math.max(0, (currentRollNumber / totalRollsInBatch) * 100))}%` }}
                />
              </div>
            </div>

            <div className="metrics-badges">
              <div className="badge-item completed">
                <CheckCircle size={14} />
                <span>Completed: {currentRollNumber}</span>
              </div>
              <div className="badge-item remaining">
                <Hourglass size={14} />
                <span>Remaining: {Math.max(0, totalRollsInBatch - currentRollNumber)}</span>
              </div>
            </div>

            <div className="last-printed-status">
              Last printed: Roll {lastPrintedRoll ? `${lastPrintedRoll}` : '—'}
            </div>

            <button className="btn-stop-batch-cancel" onClick={() => setShowStopConfirm(true)}>
              <Square size={16} />
              Stop & Cancel Remaining Rolls
            </button>
          </div>
        </div>
      )}

      {/* Stop Batch Confirm Dialog */}
      {showStopConfirm && (
        <div className="modal-overlay">
          <div className="modal-content text-center">
            <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: 15 }} />
            <h3>Stop Batch Processing?</h3>
            <p>You have processed {currentRollNumber} of {totalRollsInBatch} rolls. Stopping now will close the batch session.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setShowStopConfirm(false)}>
                Cancel
              </button>
              <button className="btn" style={{ background: '#ef4444', color: 'white', border: 'none' }} onClick={stopBatchEarly}>
                Yes, Stop Batch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReAddMaterialForm;

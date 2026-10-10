import React, { useState, useRef, useEffect } from 'react';
import LocationPicker from '../components/LocationPicker.jsx';
import MasterDropdown from '../components/MasterDropdown.jsx';
import { useNavigate } from 'react-router-dom';
import { store, BASE_URL } from '../store.js';
import {
  Printer, Play, Square, RotateCcw,
  CheckCircle2, AlertTriangle, AlertCircle,
  X, CheckCircle, PackagePlus, Eye, Save,
  Box, Hourglass, ArrowLeftRight, Scale, ArrowLeft
} from 'lucide-react';
import '../Design/FabricStickerForm.css';

const FabricStockkgs = () => {
  const navigate = useNavigate();

  // Get logged in user data
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Shelves from warehouse settings
  const [shelves, setShelves] = useState([]);

  // Main Form Data
  const [formData, setFormData] = useState({
    cmfName: '',
    fabricName: '',
    group: '',
    shade: '',
    lotNumber: '',
    billNumber: '',
    location: '',
    receivedPerson: '',
    authorizedPerson: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Manual roll weight in KGS input state
  const [manualKgs, setManualKgs] = useState('');

  // Batch processing states
  const [batchMode, setBatchMode] = useState(false);
  const [totalRollsInBatch, setTotalRollsInBatch] = useState(1);
  const [currentRollNumber, setCurrentRollNumber] = useState(0);
  const [completedRolls, setCompletedRolls] = useState([]);
  const [batchInfo, setBatchInfo] = useState(null);
  const [batchActive, setBatchActive] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const [submittedData, setSubmittedData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPrintedRoll, setLastPrintedRoll] = useState(null);

  // UI Instructions
  const [uiInstruction, setUiInstruction] = useState('');
  const [instructionType, setInstructionType] = useState('info');

  // Step indicators state
  const [activeSteps, setActiveSteps] = useState({
    step1: false, // Fill Form Details
    step2: false, // Set Total Rolls
    step3: false, // Start Batch
    step4: false, // Enter Weight & Print
    step5: false  // Complete
  });

  // Refs for tracking - Optimized memory management
  const isMounted = useRef(true);
  const wsRef = useRef(null);

  // Print service states
  const [printServiceStatus, setPrintServiceStatus] = useState('connecting');
  const [printQueueLength, setPrintQueueLength] = useState(0);
  const [lastPrintStatus, setLastPrintStatus] = useState(null);
  const [wsReady, setWsReady] = useState(false);

  // Network / Backend health
  const [isOnline, setIsOnline] = useState(true);
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const networkIntervalRef = useRef(null);
  const offlineQueueRef = useRef([]);

  // Batch details
  const [batchNumber, setBatchNumber] = useState('');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchTime, setBatchTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  // Sequential barcode tracking (starts at 4000000 series)
  const [nextBarcodeId, setNextBarcodeId] = useState(null);
  const [barcodeSequence, setBarcodeSequence] = useState({
    current: 0,
    next: 1,
    lastGenerated: null
  });
  const [isLoadingSequence, setIsLoadingSequence] = useState(true);

  // Refs for cleanup
  const timeIntervalRef = useRef(null);

  // Keep offlineQueueRef in sync with state
  useEffect(() => {
    offlineQueueRef.current = offlineQueue;
  }, [offlineQueue]);

  // Network health check — pings backend every 5 s
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

        // Came back ONLINE
        if (!isOnline) {
          setIsOnline(true);
          showNotification('✅ Network restored! Processing queued prints...', 'success');

          // Flush offline queue
          const queue = [...offlineQueueRef.current];
          if (queue.length > 0) {
            setOfflineQueue([]);
            offlineQueueRef.current = [];
            for (const job of queue) {
              const stored = await storeDataInGoogleSheets(job.stickerData, job.rollNumber);
              if (stored) {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && printServiceStatus === 'ready') {
                  printViaPythonService(job.stickerData);
                  showNotification(`✓ Queued Roll ${job.rollNumber} sticker printed!`, 'success');
                } else {
                  showNotification(`⚠️ Roll ${job.rollNumber} data saved, printer offline`, 'warning');
                }
              }
            }
          }
        } else {
          setIsOnline(true);
        }
      } catch {
        if (isMounted.current) setIsOnline(false);
      } finally {
        if (isMounted.current) setIsCheckingNetwork(false);
      }
    };

    checkNetwork(); // immediate check
    networkIntervalRef.current = setInterval(checkNetwork, 5000);

    return () => {
      if (networkIntervalRef.current) clearInterval(networkIntervalRef.current);
    };
  }, [isOnline, printServiceStatus]);

  // Update step indicators
  useEffect(() => {
    const isStep1Complete =
      formData.cmfName.trim() !== '' &&
      formData.fabricName.trim() !== '' &&
      formData.group.trim() !== '' &&
      formData.shade.trim() !== '' &&
      formData.lotNumber.trim() !== '' &&
      formData.billNumber.trim() !== '' &&
      formData.location.trim() !== '' &&
      formData.receivedPerson.trim() !== '' &&
      formData.authorizedPerson.trim() !== '';

    setActiveSteps(prev => ({ ...prev, step1: isStep1Complete }));

    const isStep2Complete = totalRollsInBatch > 0;
    setActiveSteps(prev => ({ ...prev, step2: isStep2Complete }));

    setActiveSteps(prev => ({ ...prev, step3: batchActive }));

    const isStep4Active = batchActive && manualKgs !== '' && parseFloat(manualKgs) > 0;
    setActiveSteps(prev => ({ ...prev, step4: isStep4Active }));

    const isStep5Complete = batchActive && currentRollNumber > 0;
    setActiveSteps(prev => ({ ...prev, step5: isStep5Complete }));

  }, [formData, totalRollsInBatch, batchActive, manualKgs, currentRollNumber]);

  // Update UI instruction helper
  const updateInstruction = (message, type = 'info') => {
    if (!isMounted.current) return;
    setUiInstruction(message);
    setInstructionType(type);
  };

  // Load logged in user data and shelves
  useEffect(() => {
    isMounted.current = true;
    const userData = localStorage.getItem('twms_user');
    if (userData && isMounted.current) {
      setLoggedInUser(JSON.parse(userData));
    } else if (isMounted.current) {
      setLoggedInUser({ name: 'Admin User', role: 'Admin' });
    }

    store.getShelves()
      .then(data => {
        if (isMounted.current) {
          setShelves(data || []);
        }
      })
      .catch(console.error);

    return () => {
      isMounted.current = false;
      cleanupAllResources();
    };
  }, []);

  // Filter location based on batch size
  useEffect(() => {
    const reqRolls = parseInt(totalRollsInBatch) || 0;
    const available = shelves.filter(s => (s.capacity - s.used) >= reqRolls);
    if (available.length > 0) {
      if (!available.some(s => s.id === formData.location)) {
        setFormData(prev => ({ ...prev, location: available[0].id }));
      }
    } else {
      setFormData(prev => ({ ...prev, location: '' }));
    }
  }, [totalRollsInBatch, shelves]);

  const cleanupAllResources = () => {
    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current);
      timeIntervalRef.current = null;
    }
  };

  // Update time
  useEffect(() => {
    timeIntervalRef.current = setInterval(() => {
      if (isMounted.current) {
        setBatchTime(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    }, 1000);

    return () => {
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
        timeIntervalRef.current = null;
      }
    };
  }, []);

  // Next barcode helper (Type: fabric-stock-kgs starting at 4000000 series)
  const loadNextBarcodeId = async () => {
    if (!isMounted.current) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      setIsLoadingSequence(true);
      const response = await fetch(`${BASE_URL}/google-sheets/next-barcode-id?type=fabric-stock-kgs`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();

      if (responseData.success && isMounted.current) {
        const { barcodeId, numericId, lastId } = responseData.data;
        setNextBarcodeId(barcodeId);
        setBarcodeSequence({
          current: lastId || 0,
          next: numericId,
          lastGenerated: barcodeId
        });
        return barcodeId;
      } else if (isMounted.current) {
        return getFallbackBarcodeId();
      }
    } catch (error) {
      clearTimeout(timeoutId);
      return getFallbackBarcodeId();
    } finally {
      if (isMounted.current) {
        setIsLoadingSequence(false);
      }
    }
  };

  const getFallbackBarcodeId = () => {
    const fallbackId = String(Date.now()).slice(-6);
    return fallbackId;
  };

  const getNextSequentialBarcodeId = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${BASE_URL}/google-sheets/next-barcode-id?type=fabric-stock-kgs`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();

      if (responseData.success && isMounted.current) {
        const { barcodeId, numericId } = responseData.data;
        setBarcodeSequence(prev => ({
          current: numericId - 1,
          next: numericId,
          lastGenerated: barcodeId
        }));
        return barcodeId;
      } else {
        throw new Error('Failed to get sequential ID');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const fallbackId = String(Date.now()).slice(-6);
      return fallbackId;
    }
  };

  const showNotification = (message, type = 'info') => {
    if (!isMounted.current) return;

    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#1a237e'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification && notification.remove) {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
          if (notification && notification.remove) notification.remove();
        }, 300);
      }
    }, 3000);
  };

  const saveOfflineData = async (data, rollNumber) => {
    if (!isMounted.current) return;

    const offlineData = JSON.parse(localStorage.getItem('offlineFabricData') || '[]');
    offlineData.push({
      ...data,
      rollNumber: rollNumber,
      offlineSavedAt: new Date().toISOString()
    });
    localStorage.setItem('offlineFabricData', JSON.stringify(offlineData));
  };

  const logBatchCompletion = async (totalProcessed) => {
    if (!batchInfo || !isMounted.current) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(`${BASE_URL}/batch/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batchId: `BATCH-${Date.now()}`,
          batchNumber: batchNumber,
          batchDate: batchDate,
          batchStartTime: batchTime,
          lotNumber: batchInfo.lotNumber,
          totalRolls: totalRollsInBatch,
          processedRolls: totalProcessed,
          status: 'completed',
          completedAt: new Date().toISOString(),
          completedBy: batchInfo.receivedPerson || 'System'
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
    }
  };

  const storeDataInGoogleSheets = async (data, rollNumber) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

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
        weight: data.weight, // manual weight in KGs stored in weight column
        unit: 'KGS', // unit set to KGS
        generatedAt: data.generatedAt || new Date().toLocaleTimeString(),
        timestamp: data.timestamp || new Date().toISOString(),
        status: 'in_stock'
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
        const storedRolls = JSON.parse(localStorage.getItem('fabricRolls') || '[]');
        storedRolls.push(payload);
        localStorage.setItem('fabricRolls', JSON.stringify(storedRolls));
        return true;
      } else {
        showNotification(`⚠️ Save failed: ${responseData.message}`, 'error');
        return false;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      showNotification(`❌ Connection Error: ${error.message}`, 'error');
      await saveOfflineData(data, rollNumber);
      return false;
    }
  };

  const stopBatch = async () => {
    if (!batchActive || !isMounted.current) return;

    setShowStopConfirm(false);

    const actualRollsProcessed = currentRollNumber;
    const expectedRolls = totalRollsInBatch;
    const cancelledRolls = expectedRolls - actualRollsProcessed;

    const summary = {
      batchStopped: true,
      stoppedAt: new Date().toISOString(),
      expectedRolls: expectedRolls,
      actualRollsProcessed: actualRollsProcessed,
      cancelledRolls: cancelledRolls,
      completedRolls: completedRolls,
      batchInfo: batchInfo,
      batchNumber: batchNumber,
      batchDate: batchDate,
      note: `${cancelledRolls} rolls were CANCELLED - not saved`
    };

    const stoppedBatches = JSON.parse(localStorage.getItem('completedBatches') || '[]');
    stoppedBatches.push(summary);
    localStorage.setItem('completedBatches', JSON.stringify(stoppedBatches));

    showNotification(
      `✓ Batch completed! Processed ${actualRollsProcessed} of ${expectedRolls} rolls.`,
      'success'
    );

    const stopController = new AbortController();
    const stopTimeoutId = setTimeout(() => stopController.abort(), 5000);

    try {
      await fetch(`${BASE_URL}/batch/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...summary,
          message: `${cancelledRolls} rolls cancelled - not saved`
        }),
        signal: stopController.signal
      });
      clearTimeout(stopTimeoutId);
    } catch (error) {
      clearTimeout(stopTimeoutId);
    }

    setBatchActive(false);
    setBatchMode(false);
    updateInstruction('Batch completed. Click "New Batch" to start again', 'success');

    setTimeout(() => {
      if (isMounted.current) {
        const userMessage = window.confirm(
          `✅ Batch Summary:\n\n` +
          `Batch Number: ${batchNumber}\n` +
          `Date: ${batchDate}\n` +
          `✓ Successfully Processed: ${actualRollsProcessed} rolls\n` +
          `✗ CANCELLED / DELETED: ${cancelledRolls} rolls\n` +
          `📦 Total Expected: ${expectedRolls} rolls\n\n` +
          `Do you want to start a new batch?`
        );

        if (userMessage) {
          handleReset();
        }
      }
    }, 500);
  };

  const cancelStopBatch = () => {
    setShowStopConfirm(false);
  };

  // Connect websocket printing
  useEffect(() => {
    connectToPrintService();
    loadNextBarcodeId();

    return () => {
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
        wsRef.current = null;
      }
    };
  }, []);

  const connectToPrintService = () => {
    const wsHost = 'localhost';
    const WS_URL = `ws://${wsHost}:8765`;

    console.log('🔌 Connecting to print service at:', WS_URL);

    const connectionTimeout = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
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
  };

  const printViaPythonService = (stickerData) => {
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
  };

  const startBatchProcess = async () => {
    if (!isMounted.current) return;

    let currentBatchNumber = batchNumber;
    if (!currentBatchNumber) {
      currentBatchNumber = `BATCH-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
      setBatchNumber(currentBatchNumber);
    }

    // Validation
    if (!formData.cmfName || formData.cmfName.trim() === '') {
      showNotification("❌ CMP Name is required.", "error");
      updateInstruction("❌ Please enter CMP Name", "error");
      return;
    }
    if (!formData.fabricName || formData.fabricName.trim() === '') {
      showNotification("❌ Fabric Name is required.", "error");
      updateInstruction("❌ Please enter Fabric Name", "error");
      return;
    }
    if (!formData.group || formData.group.trim() === '') {
      showNotification("❌ Group is required.", "error");
      updateInstruction("❌ Please enter Group", "error");
      return;
    }
    if (!formData.shade || formData.shade.trim() === '') {
      showNotification("❌ Shade is required.", "error");
      updateInstruction("❌ Please enter Shade", "error");
      return;
    }
    if (!formData.lotNumber || formData.lotNumber.trim() === '') {
      showNotification("❌ Lot Number is required.", "error");
      updateInstruction("❌ Please enter Lot Number", "error");
      return;
    }
    if (!formData.billNumber || formData.billNumber.trim() === '') {
      showNotification("❌ Bill Number is required.", "error");
      updateInstruction("❌ Please enter Bill Number", "error");
      return;
    }
    if (!formData.location || formData.location.trim() === '') {
      showNotification("❌ Location is required.", "error");
      updateInstruction("❌ Please enter Location", "error");
      return;
    }
    if (!formData.receivedPerson || formData.receivedPerson.trim() === '') {
      showNotification("❌ Received Person is required.", "error");
      updateInstruction("❌ Please enter Received Person", "error");
      return;
    }
    if (!formData.authorizedPerson || formData.authorizedPerson.trim() === '') {
      showNotification("❌ Authorized Person is required.", "error");
      updateInstruction("❌ Please enter Authorized Person", "error");
      return;
    }
    if (!totalRollsInBatch || totalRollsInBatch < 1) {
      showNotification("❌ Please enter total number of rolls in batch.", "error");
      updateInstruction("❌ Please enter total number of rolls", "error");
      return;
    }

    showNotification("Loading next barcode sequence...", "info");
    updateInstruction("📋 Loading barcode sequence...", "info");
    await loadNextBarcodeId();

    const batchInfoData = {
      cmfName: formData.cmfName,
      fabricName: formData.fabricName,
      group: formData.group,
      shade: formData.shade,
      lotNumber: formData.lotNumber,
      billNumber: formData.billNumber,
      date: formData.date,
      location: formData.location,
      receivedPerson: formData.receivedPerson,
      authorizedPerson: formData.authorizedPerson
    };

    setBatchInfo(batchInfoData);
    setSubmittedData(batchInfoData);
    setBatchActive(true);
    setCurrentRollNumber(0);
    setCompletedRolls([]);
    setBatchMode(false);
    setManualKgs('');

    const nextIdDisplay = nextBarcodeId || 'loading...';
    updateInstruction(`✅ Batch started! Enter weight in KGS for roll 1 of ${totalRollsInBatch}`, 'success');
    showNotification(`✅ Batch started! Next barcode: ${nextIdDisplay}`, 'success');
  };

  const handlePrint = async () => {
    if (isProcessing) {
      showNotification('Already processing, please wait...', 'warning');
      return;
    }

    if (!batchActive) {
      showNotification('Please start a batch first', 'warning');
      return;
    }

    if (currentRollNumber >= totalRollsInBatch) {
      showNotification('All rolls already processed', 'warning');
      return;
    }

    const kgsVal = parseFloat(manualKgs);
    if (isNaN(kgsVal) || kgsVal <= 0.01) {
      showNotification(`Please enter a valid weight in KGs.`, 'warning');
      return;
    }

    if (!barcodeSequence.next || isNaN(barcodeSequence.next)) {
      showNotification('Barcode sequence not loaded yet. Please check backend connection.', 'error');
      return;
    }

    setIsProcessing(true);
    updateInstruction(`🖨️ Printing sticker for roll ${currentRollNumber + 1}...`, 'info');

    try {
      const barcodeId = await getNextSequentialBarcodeId();
      const currentTime = new Date();
      const timeString = currentTime.toLocaleTimeString();
      const dateString = currentTime.toISOString().split('T')[0];

      const stickerData = {
        cmfName: batchInfo.cmfName,
        fabricName: batchInfo.fabricName,
        group: batchInfo.group,
        shade: batchInfo.shade,
        weight: kgsVal.toFixed(2), // manual weight value in KGS
        lotNumber: batchInfo.lotNumber,
        billNumber: batchInfo.billNumber,
        date: batchInfo.date || dateString,
        location: batchInfo.location,
        receivedPerson: batchInfo.receivedPerson,
        authorizedPerson: batchInfo.authorizedPerson,
        rollNumber: currentRollNumber + 1,
        totalRolls: totalRollsInBatch,
        uniqueBarcodeId: barcodeId,
        unit: 'KGS', // unit set to KGS
        generatedAt: timeString,
        timestamp: currentTime.toISOString(),
        status: 'in_stock'
      };

      if (!isOnline) {
        const queuedJob = { stickerData, rollNumber: currentRollNumber + 1 };
        setOfflineQueue(prev => [...prev, queuedJob]);
        showNotification(`🔴 No network — Roll ${currentRollNumber + 1} queued.`, 'warning');
        updateInstruction('🔴 No network! Roll queued — waiting for connection...', 'error');

        setCompletedRolls(prev => [...prev, {
          rollNumber: currentRollNumber + 1,
          weight: kgsVal.toFixed(2),
          barcodeId: barcodeId,
          timestamp: timeString,
          fabricName: batchInfo.fabricName,
          shade: batchInfo.shade,
          queued: true
        }]);

        const newRollNumber = currentRollNumber + 1;
        setCurrentRollNumber(newRollNumber);
        setLastPrintedRoll(newRollNumber);
        loadNextBarcodeId();
        setManualKgs('');

        if (newRollNumber >= totalRollsInBatch) {
          setBatchActive(false);
          updateInstruction('🔴 Batch done. Queued rolls will print when network restores.', 'warning');
        } else {
          updateInstruction(`⏳ Roll ${newRollNumber} queued. Enter weight in KGs for roll ${newRollNumber + 1} of ${totalRollsInBatch}`, 'warning');
        }
        return;
      }

      const stored = await storeDataInGoogleSheets(stickerData, currentRollNumber + 1);

      if (stored) {
        setSubmittedData(stickerData);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && printServiceStatus === 'ready') {
          printViaPythonService(stickerData);
          showNotification(`✓ Roll ${currentRollNumber + 1} sticker printed!`, 'success');
          updateInstruction(`✅ Roll ${currentRollNumber + 1} printed!`, 'success');
        } else {
          showNotification('⚠️ Data saved but print service offline', 'warning');
        }

        setCompletedRolls(prev => [...prev, {
          rollNumber: currentRollNumber + 1,
          weight: kgsVal.toFixed(2),
          barcodeId: barcodeId,
          timestamp: timeString,
          fabricName: batchInfo.fabricName,
          shade: batchInfo.shade
        }]);

        const newRollNumber = currentRollNumber + 1;
        setCurrentRollNumber(newRollNumber);
        setLastPrintedRoll(newRollNumber);
        loadNextBarcodeId();
        setManualKgs('');

        if (newRollNumber >= totalRollsInBatch) {
          showNotification(`🎉 Batch complete!`, 'success');
          setBatchActive(false);
          await logBatchCompletion(newRollNumber);
          updateInstruction('🎉 Batch completed! Start a new batch to continue', 'success');
        } else {
          showNotification(`✅ Roll ${newRollNumber} done! Ready for next roll`, 'success');
          updateInstruction(`✅ Roll ${newRollNumber} printed! Enter weight in KGs for roll ${newRollNumber + 1} of ${totalRollsInBatch}`, 'success');
        }
      }
    } catch (error) {
      console.error('❌ Print error:', error);
      showNotification('Error printing', 'error');
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        // Refocus manual input
        const inputEl = document.getElementById("manual-kgs-input");
        if (inputEl) inputEl.focus();
      }, 500);
    }
  };

  const handleAutoPrintAll = async () => {
    if (isProcessing) {
      showNotification('Already processing, please wait...', 'warning');
      return;
    }

    if (!batchActive) {
      showNotification('Please start a batch first', 'warning');
      return;
    }

    const remainingRollsCount = totalRollsInBatch - currentRollNumber;
    if (remainingRollsCount <= 0) {
      showNotification('All rolls already processed', 'warning');
      return;
    }

    const kgsVal = parseFloat(manualKgs);
    if (isNaN(kgsVal) || kgsVal <= 0.01) {
      showNotification(`Please enter a valid weight in KGs.`, 'warning');
      return;
    }

    if (!barcodeSequence.next || isNaN(barcodeSequence.next)) {
      showNotification('Barcode sequence not loaded yet. Please check backend connection.', 'error');
      return;
    }

    const confirmPrint = window.confirm(`Are you sure you want to print all remaining ${remainingRollsCount} rolls with ${kgsVal.toFixed(2)} KGS?`);
    if (!confirmPrint) return;

    setIsProcessing(true);
    updateInstruction(`🖨️ Auto-printing all remaining ${remainingRollsCount} rolls...`, 'info');

    try {
      let completedList = [];
      let successCount = 0;
      const startRollNum = currentRollNumber + 1;

      for (let r = startRollNum; r <= totalRollsInBatch; r++) {
        const offset = r - startRollNum;
        const currentSeqId = barcodeSequence.next + offset;
        const barcodeId = String(currentSeqId);

        const currentTime = new Date();
        const timeString = currentTime.toLocaleTimeString();
        const dateString = currentTime.toISOString().split('T')[0];

        const stickerData = {
          cmfName: batchInfo.cmfName,
          fabricName: batchInfo.fabricName,
          group: batchInfo.group,
          shade: batchInfo.shade,
          weight: kgsVal.toFixed(2), // manual weight in KGS
          lotNumber: batchInfo.lotNumber,
          billNumber: batchInfo.billNumber,
          date: batchInfo.date || dateString,
          location: batchInfo.location,
          receivedPerson: batchInfo.receivedPerson,
          authorizedPerson: batchInfo.authorizedPerson,
          rollNumber: r,
          totalRolls: totalRollsInBatch,
          uniqueBarcodeId: barcodeId,
          unit: 'KGS', // unit set to KGS
          generatedAt: timeString,
          timestamp: currentTime.toISOString(),
          status: 'in_stock'
        };

        if (!isOnline) {
          const queuedJob = { stickerData, rollNumber: r };
          setOfflineQueue(prev => [...prev, queuedJob]);
          completedList.push({
            rollNumber: r,
            weight: kgsVal.toFixed(2),
            barcodeId: barcodeId,
            timestamp: timeString,
            fabricName: batchInfo.fabricName,
            shade: batchInfo.shade,
            queued: true
          });
          successCount++;
          continue;
        }

        const stored = await storeDataInGoogleSheets(stickerData, r);
        if (stored) {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && printServiceStatus === 'ready') {
            printViaPythonService(stickerData);
          }
          completedList.push({
            rollNumber: r,
            weight: kgsVal.toFixed(2),
            barcodeId: barcodeId,
            timestamp: timeString,
            fabricName: batchInfo.fabricName,
            shade: batchInfo.shade
          });
          successCount++;
        } else {
          showNotification(`❌ Failed to save Roll ${r}. Stopped printing.`, 'error');
          break;
        }
      }

      if (successCount > 0) {
        setCompletedRolls(prev => [...prev, ...completedList]);
        const finalRollNo = currentRollNumber + successCount;
        setCurrentRollNumber(finalRollNo);
        setLastPrintedRoll(finalRollNo);
        loadNextBarcodeId();
        setManualKgs('');

        if (finalRollNo >= totalRollsInBatch) {
          showNotification(`🎉 Batch complete! Printed ${successCount} rolls.`, 'success');
          setBatchActive(false);
          await logBatchCompletion(finalRollNo);
          updateInstruction('🎉 Batch completed! Start a new batch to continue', 'success');
        } else {
          showNotification(`✅ Printed ${successCount} rolls!`, 'success');
          updateInstruction(`✅ Printed ${successCount} rolls. Ready for roll ${finalRollNo + 1} of ${totalRollsInBatch}`, 'success');
        }
      }
    } catch (error) {
      console.error('❌ Auto print error:', error);
      showNotification('Error during auto print', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Keyboard ENTER key on manual entry field triggers print
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (batchActive && !isProcessing && manualKgs !== '' && parseFloat(manualKgs) > 0) {
        handlePrint();
      }
    }
  };

  const handleReset = () => {
    setFormData({
      cmfName: '',
      fabricName: '',
      group: '',
      shade: '',
      lotNumber: '',
      billNumber: '',
      location: '',
      receivedPerson: '',
      authorizedPerson: '',
      date: new Date().toISOString().split('T')[0]
    });
    setBatchActive(false);
    setCurrentRollNumber(0);
    setCompletedRolls([]);
    setBatchInfo(null);
    setManualKgs('');
    setLastPrintedRoll(null);
    updateInstruction('Form reset. Fill the details to start again.', 'info');
  };

  const handleInputChange = (key, val) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="fabric-form-container">
      {/* Floating Batch Progress Card */}
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
              <div className="next-barcode-title">Next Barcode ID (4M Series)</div>
              <div className="next-barcode-value">{nextBarcodeId || '------'}</div>
              <div className="next-barcode-seq">Sequential #{nextBarcodeId || '------'}</div>
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
              Stop & Cancel Remaining
            </button>
          </div>
        </div>
      )}

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
              <span>Home</span><span>/</span><span>Stock Add</span><span>/</span><span style={{ color: 'var(--primary, #2563EB)' }}>Fabric Stock (KGs)</span>
            </div>
            <h1 className="gradient-title" style={{ margin: '2px 0 0 0', fontSize: '24px' }}>
              Add Fabric Stock (Kilograms / 4M Series)
            </h1>
            <p style={{ margin: '3px 0 0 0', color: 'var(--text-muted, #64748B)', fontSize: '12.5px' }}>
              Direct kilograms weight entry per roll with automatic 4M sequence barcode stickers.
            </p>
          </div>
        </div>
      </div>

      {/* Scale & Printer Status Banner */}
      <div className="scale-status-bar">
        <div className="status-indicators">
          <div className="indicator-item">
            <Printer size={16} /> Printer:
            <span className={`status-badge ${printServiceStatus === 'ready' ? 'connected' : printServiceStatus}`}>
              {printServiceStatus}
            </span>
          </div>

          <div className="indicator-item net-status-item">
            <span
              className={`net-light ${isOnline ? 'net-online' : 'net-offline'} ${isCheckingNetwork ? 'net-checking' : ''}`}
              title={isOnline ? 'Network OK' : 'No network'}
            />
            <span className={`net-label ${isOnline ? 'net-label-online' : 'net-label-offline'}`}>
              {isCheckingNetwork ? 'Checking...' : isOnline ? 'Network OK' : 'No Network'}
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

      {/* Offline banner */}
      {!isOnline && (
        <div className="offline-banner">
          <span className="offline-banner-dot" />
          <div className="offline-banner-text">
            <strong>No Network — Offline mode active</strong>
            <span>Queued roll data will print/save when connection restores.</span>
          </div>
        </div>
      )}

      <div className="fabric-layout-grid">
        {/* Left Side: Manual KGs Entry Box */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="weight-card connected" style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
            <div className="weight-label" style={{ color: '#e2e8f0' }}>Enter Roll Weight (KGs) manually</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '15px 0' }}>
              <input
                id="manual-kgs-input"
                className="manual-weight-input-field"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={manualKgs}
                onChange={e => setManualKgs(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!batchActive || isProcessing}
                autoFocus={batchActive}
              />
              <span className="weight-unit" style={{ color: 'white', opacity: 0.9, marginLeft: 10 }}>KG</span>
            </div>
            {batchActive && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                <button
                  className="btn btn-success btn-lg"
                  style={{
                    width: '100%',
                    marginTop: 5,
                    background: '#10b981',
                    border: 'none',
                    color: 'white',
                    fontWeight: '700',
                    boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                  onClick={handlePrint}
                  disabled={isProcessing || !manualKgs || parseFloat(manualKgs) <= 0}
                >
                  <Printer size={18} /> Print Sticker & Save Roll
                </button>

                <button
                  className="btn btn-warning btn-lg"
                  style={{
                    width: '100%',
                    marginTop: 5,
                    background: '#f59e0b',
                    border: 'none',
                    color: 'white',
                    fontWeight: '700',
                    boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                  onClick={handleAutoPrintAll}
                  disabled={isProcessing || !manualKgs || parseFloat(manualKgs) <= 0}
                >
                  <Printer size={18} /> Auto-Print All Remaining
                </button>
              </div>
            )}
          </div>

          {/* Workflow steps tracker */}
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
                <div className="step-label">Type weight in KGs & press ENTER to print roll {currentRollNumber + 1}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Batch Config, Form Details, & Roll History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Batch config controls */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Batch Setup & Process Control</div>
            </div>
            <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Total Rolls in Batch</label>
                <input
                  className="form-control"
                  type="number"
                  value={totalRollsInBatch === '' ? '' : totalRollsInBatch}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '') {
                      setTotalRollsInBatch('');
                    } else {
                      const num = parseInt(val);
                      setTotalRollsInBatch(isNaN(num) ? '' : num);
                    }
                  }}
                  onBlur={() => {
                    if (totalRollsInBatch === '' || totalRollsInBatch < 1) {
                      setTotalRollsInBatch(1);
                    }
                  }}
                />
              </div>

              {!batchActive ? (
                <button className="btn btn-primary btn-lg" onClick={startBatchProcess} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Play size={16} /> Start Batch
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-danger btn-lg" onClick={() => setShowStopConfirm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Square size={16} /> Stop & Save
                  </button>
                  <button className="btn btn-secondary btn-lg" onClick={handleReset}>
                    <RotateCcw size={16} /> Reset
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Form details input */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Roll Metadata Details</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="compact-form-row">
                <div className="form-group">
                  <label className="form-label">CMP / Party Name <span className="required">*</span></label>
                  <MasterDropdown
                    type="party"
                    value={formData.cmfName}
                    onChange={val => handleInputChange('cmfName', val)}
                    placeholder="Select or add Party..."
                    disabled={batchActive}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fabric Name <span className="required">*</span></label>
                  <MasterDropdown
                    type="fabric"
                    value={formData.fabricName}
                    onChange={val => handleInputChange('fabricName', val)}
                    placeholder="Select or add Fabric..."
                    disabled={batchActive}
                  />
                </div>
              </div>

              <div className="compact-form-row">
                <div className="form-group">
                  <label className="form-label">Group / Category <span className="required">*</span></label>
                  <MasterDropdown
                    type="category"
                    value={formData.group}
                    onChange={val => handleInputChange('group', val)}
                    placeholder="Select or add Group..."
                    disabled={batchActive}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Shade / Color <span className="required">*</span></label>
                  <MasterDropdown
                    type="shade"
                    value={formData.shade}
                    onChange={val => handleInputChange('shade', val)}
                    placeholder="Select or add Shade..."
                    disabled={batchActive}
                  />
                </div>
              </div>

              <div className="compact-form-row">
                <div className="form-group">
                  <label className="form-label">Lot Number <span className="required">*</span></label>
                  <input className="form-control" placeholder="e.g. LOT-4509" value={formData.lotNumber} onChange={e => handleInputChange('lotNumber', e.target.value)} disabled={batchActive} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bill Number <span className="required">*</span></label>
                  <input className="form-control" placeholder="e.g. BILL-9921" value={formData.billNumber} onChange={e => handleInputChange('billNumber', e.target.value)} disabled={batchActive} />
                </div>
              </div>

              <div className="compact-form-row">
                <div className="form-group">
                  <label className="form-label">Location <span className="required">*</span></label>
                  <LocationPicker
                    value={formData.location}
                    onChange={val => handleInputChange('location', val)}
                    disabled={batchActive}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label"> Date <span className="required">*</span></label>
                  <input className="form-control" type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} disabled={batchActive} />
                </div>
              </div>

              <div className="compact-form-row">
                <div className="form-group">
                  <label className="form-label">Received Person <span className="required">*</span></label>
                  <MasterDropdown
                    type="person"
                    value={formData.receivedPerson}
                    onChange={val => handleInputChange('receivedPerson', val)}
                    placeholder="Select or add Person..."
                    disabled={batchActive}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Authorized Person <span className="required">*</span></label>
                  <MasterDropdown
                    type="person"
                    value={formData.authorizedPerson}
                    onChange={val => handleInputChange('authorizedPerson', val)}
                    placeholder="Select or add Person..."
                    disabled={batchActive}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Printing overlay */}
          {isProcessing && (
            <div className="printing-overlay">
              <Printer className="animate-spin" size={20} />
              <span>Generating sticker and syncing to database...</span>
            </div>
          )}

          {/* Active / Completed Roll List */}
          {batchActive && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Completed Rolls ({completedRolls.length} / {totalRollsInBatch})</div>
              </div>
              <div className="table-wrap" style={{ border: 'none', maxHeight: '200px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Roll #</th>
                      <th>Barcode ID</th>
                      <th>Weight (KGS)</th>
                      <th>Printed Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRolls.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          No rolls weighed yet in this batch.
                        </td>
                      </tr>
                    ) : (
                      completedRolls.map(roll => (
                        <tr key={roll.rollNumber} className={roll.queued ? 'queued-roll-row' : ''}>
                          <td style={{ fontWeight: 700 }}>Roll {roll.rollNumber}</td>
                          <td style={{ color: 'var(--primary)', fontWeight: 600 }}>
                            {roll.barcodeId}
                            {roll.queued && <span className="queued-tag">⏳ Queued</span>}
                          </td>
                          <td style={{ fontWeight: 700 }}>{roll.weight} KGS</td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{roll.timestamp}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stop confirmation modal */}
      {showStopConfirm && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header">
              <div className="modal-title" style={{ color: 'var(--danger)' }}><AlertTriangle size={18} /> Stop Batch Confirmation</div>
            </div>
            <div className="modal-body" style={{ fontSize: 13 }}>
              Are you sure you want to stop the batch early? Remaining rolls (total {totalRollsInBatch - currentRollNumber}) will be cancelled and will not be recorded in database.
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={cancelStopBatch}>Cancel</button>
              <button className="btn btn-danger" onClick={stopBatch}>Confirm Stop</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FabricStockkgs;

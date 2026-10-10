import React, { useState, useRef, useEffect } from 'react';
import LocationPicker from '../components/LocationPicker.jsx';
import MasterDropdown from '../components/MasterDropdown.jsx';
import { useNavigate } from 'react-router-dom';
import { store, BASE_URL } from '../store.js';
import {
  Scale, Printer, Play, Square, RotateCcw,
  CheckCircle2, AlertTriangle, AlertCircle,
  X, CheckCircle, PackagePlus, Eye, Save,
  Box, Hourglass, ArrowLeftRight, ArrowLeft
} from 'lucide-react';
import '../Design/FabricStickerForm.css';

// AUTOFILL CONFIGURATION FOR DYEING MATERIAL
// You can edit these values to change the default automatic prefill data.
const DYEING_DEFAULT_DATA = {
  cmfName: 'Dyeing CMF',
  fabricName: 'Cotton Dyeing Fabric',
  group: 'Dyeing Group A',
  shade: 'Dyeing Shade X',
  lotNumber: '',
  billNumber: '',
  receivedPerson: '',
  authorizedPerson: '',
};

const DyeingMaterialForm = () => {
  const navigate = useNavigate();

  // Get logged in user data
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Shelves from warehouse settings
  const [shelves, setShelves] = useState([]);

  // Main Form Data with Auto-filled defaults
  const [formData, setFormData] = useState({
    cmfName: DYEING_DEFAULT_DATA.cmfName,
    fabricName: DYEING_DEFAULT_DATA.fabricName,
    group: DYEING_DEFAULT_DATA.group,
    issuedShade: DYEING_DEFAULT_DATA.shade,
    receivedShade: '',
    weight: '',
    lotNumber: DYEING_DEFAULT_DATA.lotNumber,
    billNumber: DYEING_DEFAULT_DATA.billNumber,
    location: '',
    receivedPerson: DYEING_DEFAULT_DATA.receivedPerson,
    authorizedPerson: DYEING_DEFAULT_DATA.authorizedPerson,
    date: new Date().toISOString().split('T')[0],
    rollNumberInput: '1'
  });

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
  const [currentWeight, setCurrentWeight] = useState('0.00');
  const [isReading, setIsReading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [isWeightStable, setIsWeightStable] = useState(false);
  const [lastStableWeight, setLastStableWeight] = useState('0.00');
  const [rollCount, setRollCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPrintedRoll, setLastPrintedRoll] = useState(null);

  // Track if waiting for roll removal
  const [waitingForRollRemoval, setWaitingForRollRemoval] = useState(false);

  // UI Instructions
  const [uiInstruction, setUiInstruction] = useState('');
  const [instructionType, setInstructionType] = useState('info');

  // Step indicators state
  const [activeSteps, setActiveSteps] = useState({
    step1: false, // Fill Form Details
    step2: false, // Set Total Rolls
    step3: false, // Connect Scale
    step4: false, // Start Batch
    step5: false, // Place Roll & Print
    step6: false  // Complete
  });

  // Weight tracking
  const [consecutiveSameWeight, setConsecutiveSameWeight] = useState(0);
  const [weightHistory, setWeightHistory] = useState([]);

  // Refs for tracking - Optimized memory management
  const lastWeightRef = useRef(null);
  const consecutiveCountRef = useRef(0);
  const weightBufferRef = useRef([]);
  const stableWeightValueRef = useRef(null);
  const isDisconnectingRef = useRef(false);
  const readLoopActiveRef = useRef(false);
  const abortControllerRef = useRef(null);

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

  // Lot Lookup States
  const [isFetchingLot, setIsFetchingLot] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Print service states
  const [printServiceStatus, setPrintServiceStatus] = useState('connecting');
  const [printQueueLength, setPrintQueueLength] = useState(0);
  const [lastPrintStatus, setLastPrintStatus] = useState(null);
  const [wsReady, setWsReady] = useState(false);

  // ── Network / Backend health ─────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(true);          // green = true, red = false
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState([]);     // prints waiting for network
  const networkIntervalRef = useRef(null);
  const offlineQueueRef = useRef([]);                       // sync ref for async access

  // Refs for cleanup - Optimized
  const stickerRef = useRef(null);
  const iframeRef = useRef(null);
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const weightStableTimeoutRef = useRef(null);
  const autoPrintTimeoutRef = useRef(null);
  const demoIntervalRef = useRef(null);
  const timeIntervalRef = useRef(null);
  const serialReadIntervalRef = useRef(null);

  // WebSocket reference
  const wsRef = useRef(null);
  const isMounted = useRef(true);

  // ── Keep offlineQueueRef in sync with state ──────────────────────────
  useEffect(() => {
    offlineQueueRef.current = offlineQueue;
  }, [offlineQueue]);

  // ── Network health check — pings backend every 5 s ───────────────────
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

        if (res.ok) {
          // ── came back ONLINE ─────────────────────────────────────────
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
        } else {
          if (isMounted.current) setIsOnline(false);
        }
      } catch {
        if (isMounted.current) setIsOnline(false);
      } finally {
        if (isMounted.current) setIsCheckingNetwork(false);
      }
    };

    checkNetwork(); // immediate first check
    networkIntervalRef.current = setInterval(checkNetwork, 5000);

    return () => {
      if (networkIntervalRef.current) clearInterval(networkIntervalRef.current);
    };
  }, [isOnline, printServiceStatus]); // re-register when these change
  const lastPrintTriggerRef = useRef(0);

  // Refs for tracking active states to avoid stale closures in intervals
  const batchActiveRef = useRef(batchActive);
  const waitingForRollRemovalRef = useRef(waitingForRollRemoval);
  const isProcessingRef = useRef(isProcessing);
  const currentRollNumberRef = useRef(currentRollNumber);
  const totalRollsInBatchRef = useRef(totalRollsInBatch);

  useEffect(() => {
    batchActiveRef.current = batchActive;
    waitingForRollRemovalRef.current = waitingForRollRemoval;
    isProcessingRef.current = isProcessing;
    currentRollNumberRef.current = currentRollNumber;
    totalRollsInBatchRef.current = totalRollsInBatch;
  }, [batchActive, waitingForRollRemoval, isProcessing, currentRollNumber, totalRollsInBatch]);

  useEffect(() => {
    if (isMounted.current) {
      setFormData(prev => ({ ...prev, rollNumberInput: String(currentRollNumber + 1) }));
    }
  }, [currentRollNumber]);

  useEffect(() => {
    // Check Step 1: ALL Form Details (all fields required)
    const isStep1Complete =
      formData.cmfName.trim() !== '' &&
      formData.fabricName.trim() !== '' &&
      formData.group.trim() !== '' &&
      formData.issuedShade.trim() !== '' &&
      formData.receivedShade.trim() !== '' &&
      formData.lotNumber.trim() !== '' &&
      formData.billNumber.trim() !== '' &&
      formData.location.trim() !== '' &&
      formData.receivedPerson.trim() !== '' &&
      formData.authorizedPerson.trim() !== '';

    setActiveSteps(prev => ({ ...prev, step1: isStep1Complete }));

    // Check Step 2: Total Rolls set
    const isStep2Complete = totalRollsInBatch > 0;
    setActiveSteps(prev => ({ ...prev, step2: isStep2Complete }));

    // Check Step 3: Scale Connected or Demo Mode
    const isStep3Complete = connectionStatus === 'connected' || connectionStatus === 'demo';
    setActiveSteps(prev => ({ ...prev, step3: isStep3Complete }));

    // Step 4 is batch active
    setActiveSteps(prev => ({ ...prev, step4: batchActive }));

    // Step 5 is weight detected (>= 1.0 KG)
    const isStep5Active = batchActive && parseFloat(currentWeight) >= 1.0 && !waitingForRollRemoval;
    setActiveSteps(prev => ({ ...prev, step5: isStep5Active }));

    // Step 6 is when batch is complete or processing
    const isStep6Complete = batchActive && currentRollNumber > 0;
    setActiveSteps(prev => ({ ...prev, step6: isStep6Complete }));

  }, [formData, totalRollsInBatch, connectionStatus, batchActive, currentWeight, waitingForRollRemoval, currentRollNumber]);

  // Update UI instruction
  const updateInstruction = (message, type = 'info') => {
    if (!isMounted.current) return;
    setUiInstruction(message);
    setInstructionType(type);
    console.log(`📢 UI: ${message}`);
  };

  // Load logged in user data and shelves
  useEffect(() => {
    isMounted.current = true;
    const userData = localStorage.getItem('twms_user');
    if (userData && isMounted.current) {
      setLoggedInUser(JSON.parse(userData));
    } else if (isMounted.current) {
      // Allow demo user if not logged in for simplicity in development
      setLoggedInUser({ name: 'Admin User', role: 'Admin' });
    }

    // Load shelves for valid location selection
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

  // Automatically filter and select a valid location based on total rolls in batch
  useEffect(() => {
    const reqRolls = parseInt(totalRollsInBatch) || 0;
    const available = shelves.filter(s => (s.capacity - s.used) >= reqRolls);
    if (available.length > 0) {
      // If current selected location is not valid/available, select the first valid one
      if (!available.some(s => s.id === formData.location)) {
        setFormData(prev => ({ ...prev, location: available[0].id }));
      }
    } else {
      setFormData(prev => ({ ...prev, location: '' }));
    }
  }, [totalRollsInBatch, shelves]);

  // Centralized cleanup function
  const cleanupAllResources = async () => {
    console.log('🧹 Starting comprehensive cleanup...');

    if (weightStableTimeoutRef.current) {
      clearTimeout(weightStableTimeoutRef.current);
      weightStableTimeoutRef.current = null;
    }

    if (autoPrintTimeoutRef.current) {
      clearTimeout(autoPrintTimeoutRef.current);
      autoPrintTimeoutRef.current = null;
    }

    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current);
      timeIntervalRef.current = null;
    }

    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }

    if (serialReadIntervalRef.current) {
      clearInterval(serialReadIntervalRef.current);
      serialReadIntervalRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    await disconnectScale();

    if (weightBufferRef.current) {
      weightBufferRef.current = [];
    }

    lastWeightRef.current = null;
    stableWeightValueRef.current = null;
    consecutiveCountRef.current = 0;
    isDisconnectingRef.current = false;
    readLoopActiveRef.current = false;

    console.log('✅ Cleanup completed');
  };

  // Update current time every second
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

  // Load the next sequential barcode ID from backend
  const loadNextBarcodeId = async () => {
    if (!isMounted.current) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      setIsLoadingSequence(true);
      const response = await fetch(`${BASE_URL}/google-sheets/next-barcode-id?type=dyeing`, {
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
        console.log(`📋 Loaded next barcode ID: ${barcodeId} (Sequence: ${numericId})`);
        return barcodeId;
      } else if (isMounted.current) {
        console.error('Failed to get next barcode ID, using fallback');
        return getFallbackBarcodeId();
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error loading next barcode ID:', error);
      return getFallbackBarcodeId();
    } finally {
      if (isMounted.current) {
        setIsLoadingSequence(false);
      }
    }
  };

  // Fallback method if API fails
  const getFallbackBarcodeId = () => {
    const fallbackId = String(Date.now()).slice(-6);
    console.warn('Using fallback barcode ID:', fallbackId);
    return fallbackId;
  };

  // Function to get next sequential barcode ID
  const getNextSequentialBarcodeId = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${BASE_URL}/google-sheets/next-barcode-id?type=dyeing`, {
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
        console.log(`🔢 Generated sequential barcode: ${barcodeId} (No. ${numericId})`);
        return barcodeId;
      } else {
        throw new Error('Failed to get sequential ID');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error getting sequential barcode:', error);
      const fallbackId = String(Date.now()).slice(-6);
      console.warn('Using fallback barcode ID:', fallbackId);
      return fallbackId;
    }
  };

  // Show notification helper
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

  // Save offline data helper
  const saveOfflineData = async (data, rollNumber) => {
    if (!isMounted.current) return;

    const offlineData = JSON.parse(localStorage.getItem('offlineFabricData') || '[]');
    offlineData.push({
      ...data,
      rollNumber: rollNumber,
      offlineSavedAt: new Date().toISOString()
    });
    localStorage.setItem('offlineFabricData', JSON.stringify(offlineData));
    console.log(`💾 Data saved offline (${offlineData.length} items pending sync)`);
  };

  // Log batch completion
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
      console.log('✓ Batch completion logged');
    } catch (error) {
      clearTimeout(timeoutId);
      console.log('Could not log batch completion:', error);
    }
  };

  // Store data in Google Sheets (locally mapped)
  const storeDataInGoogleSheets = async (data, rollNumber) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const API_URL = `${BASE_URL}/google-sheets/store-dyeing-data`;

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
        weight: data.weight,
        generatedAt: data.generatedAt || new Date().toLocaleTimeString(),
        timestamp: data.timestamp || new Date().toISOString(),
        status: 'in_stock'
      };

      console.log('📤 SAVING ROLL TO DATABASE:', payload);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      let responseData;
      try {
        responseData = await response.json();
      } catch (jsonErr) {
        responseData = null;
      }

      if (!response.ok) {
        const detail = responseData?.message || responseData?.error || `status: ${response.status}`;
        throw new Error(`HTTP error! ${detail}`);
      }

      if (responseData.success && isMounted.current) {
        console.log(`✅ SUCCESS: Roll ${rollNumber} saved with barcode: ${data.uniqueBarcodeId}`);
        showNotification(`✓ Roll ${rollNumber} saved (Barcode: ${data.uniqueBarcodeId})`, 'success');

        const storedRolls = JSON.parse(localStorage.getItem('fabricRolls') || '[]');
        storedRolls.push(payload);
        localStorage.setItem('fabricRolls', JSON.stringify(storedRolls));

        return true;
      } else {
        console.error('❌ Backend returned error:', responseData);
        showNotification(`⚠️ Save failed: ${responseData.message}`, 'error');
        return false;
      }

    } catch (error) {
      clearTimeout(timeoutId);
      console.error('❌ NETWORK ERROR:', error);
      showNotification(`❌ Connection Error: ${error.message}`, 'error');
      await saveOfflineData(data, rollNumber);
      return false;
    }
  };

  // Stop batch function
  const stopBatch = async () => {
    if (!batchActive || !isMounted.current) return;

    setShowStopConfirm(false);
    setWaitingForRollRemoval(false);

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

    console.log('Batch stopped:', summary);

    const stoppedBatches = JSON.parse(localStorage.getItem('completedBatches') || '[]');
    stoppedBatches.push(summary);
    localStorage.setItem('completedBatches', JSON.stringify(stoppedBatches));

    showNotification(
      `✓ Batch completed! Processed ${actualRollsProcessed} of ${expectedRolls} rolls. ${cancelledRolls} rolls were CANCELLED.`,
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
      console.log('Could not sync batch completion to backend:', error);
    }

    setBatchActive(false);
    setBatchMode(false);
    updateInstruction('Batch completed. Click "New Batch" to start again', 'success');

    // Reset step indicators
    setActiveSteps(prev => ({ ...prev, step4: false, step5: false, step6: false }));

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

  // Connect to Print Service
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
      if (autoPrintTimeoutRef.current) {
        clearTimeout(autoPrintTimeoutRef.current);
        autoPrintTimeoutRef.current = null;
      }
      if (weightStableTimeoutRef.current) {
        clearTimeout(weightStableTimeoutRef.current);
        weightStableTimeoutRef.current = null;
      }
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
    };
  }, []);

  const connectToPrintService = () => {
    const wsHost = 'localhost';
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

  // Reset tracking for new roll
  const resetTracking = () => {
    if (weightStableTimeoutRef.current) {
      clearTimeout(weightStableTimeoutRef.current);
      weightStableTimeoutRef.current = null;
    }

    if (autoPrintTimeoutRef.current) {
      clearTimeout(autoPrintTimeoutRef.current);
      autoPrintTimeoutRef.current = null;
    }

    lastWeightRef.current = null;
    consecutiveCountRef.current = 0;
    stableWeightValueRef.current = null;
    setIsWeightStable(false);
    setLastStableWeight('0.00');
    weightBufferRef.current = [];
  };

  // Weight extraction with validation
  const extractWeightFromData = (data) => {
    // Strict patterns: require decimal point and reasonable precision
    const patterns = [
      /(\d{1,4}\.\d{2,3})\s*(?:kg|KG|Kg)?/,  // e.g. 13.78 kg
      /(\d{1,4}\.\d{1})\s*(?:kg|KG|Kg)?/,      // e.g. 13.8 kg
    ];

    for (const pattern of patterns) {
      const match = data.match(pattern);
      if (match && match[1]) {
        let weight = parseFloat(match[1]);
        // Reject clearly invalid readings: must be 1.0 – 200.0 kg
        if (!isNaN(weight) && weight >= 1.0 && weight <= 200.0) {
          weight = Math.round(weight * 100) / 100;
          return weight.toFixed(2);
        }
      }
    }
    return null;
  };

  // Enhanced stopReading function
  const stopReading = async () => {
    readLoopActiveRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
      } catch (error) {
        console.error('Error canceling reader:', error);
      }
      readerRef.current = null;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  };

  // Enhanced disconnect function
  const disconnectScale = async () => {
    if (isDisconnectingRef.current) return;

    isDisconnectingRef.current = true;
    updateInstruction('Disconnecting scale... Please wait', 'warning');

    if (weightStableTimeoutRef.current) {
      clearTimeout(weightStableTimeoutRef.current);
      weightStableTimeoutRef.current = null;
    }

    if (autoPrintTimeoutRef.current) {
      clearTimeout(autoPrintTimeoutRef.current);
      autoPrintTimeoutRef.current = null;
    }

    await stopReading();

    await new Promise(resolve => setTimeout(resolve, 200));

    if (portRef.current) {
      try {
        if (portRef.current.readable) {
          await portRef.current.readable.cancel();
        }
        await portRef.current.close();
        portRef.current = null;
      } catch (error) {
        console.error('Error closing port:', error);
        portRef.current = null;
      }
    }

    if (weightBufferRef.current) {
      weightBufferRef.current = [];
    }

    lastWeightRef.current = null;
    stableWeightValueRef.current = null;
    consecutiveCountRef.current = 0;
    readLoopActiveRef.current = false;

    if (isMounted.current) {
      setIsConnected(false);
      setConnectionStatus('disconnected');
      setCurrentWeight('0.00');
      setIsWeightStable(false);
      setConsecutiveSameWeight(0);
      setWeightHistory([]);
      setWaitingForRollRemoval(false);
      setErrorMessage('');
      updateInstruction('Scale disconnected. Click "Connect USB Scale" to reconnect', 'info');
      showNotification('Scale disconnected successfully!', 'success');
    }

    isDisconnectingRef.current = false;
  };

  // Reset serial connection function
  const resetSerialConnection = async () => {
    updateInstruction('Resetting serial connection...', 'warning');
    await disconnectScale();
    await new Promise(resolve => setTimeout(resolve, 500));

    if (isMounted.current) {
      setCurrentWeight('0.00');
      setConnectionStatus('disconnected');
      setIsConnected(false);
      setErrorMessage('');
      updateInstruction('Serial connection reset. You can now reconnect the scale.', 'success');
      showNotification('Serial connection reset successfully!', 'success');
    }
  };

  // Enhanced startReading function
  const startReading = async (port) => {
    if (readLoopActiveRef.current) {
      await stopReading();
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let lastReadTime = 0;
    const MIN_READ_INTERVAL = 200;
    let consecutiveEmptyReads = 0;
    readLoopActiveRef.current = true;

    try {
      while (port.readable && isMounted.current && readLoopActiveRef.current && !isDisconnectingRef.current) {
        readerRef.current = port.readable.getReader();

        try {
          while (true && isMounted.current && readLoopActiveRef.current && !isDisconnectingRef.current) {
            const { value, done } = await readerRef.current.read();

            if (done) break;

            const now = Date.now();
            if (now - lastReadTime < MIN_READ_INTERVAL) {
              continue;
            }
            lastReadTime = now;

            const text = decoder.decode(value);
            buffer += text;

            let lines = buffer.split(/\r?\n|\r/);
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine) {
                consecutiveEmptyReads++;
                if (consecutiveEmptyReads > 10) {
                  buffer = '';
                  consecutiveEmptyReads = 0;
                }
                continue;
              }

              consecutiveEmptyReads = 0;

              const weight = extractWeightFromData(trimmedLine);
              if (weight !== null && !isNaN(weight)) {
                updateWeightDisplay(weight);
              }
            }

            if (buffer.length > 500) {
              buffer = '';
            }
          }
        } catch (error) {
          break;
        } finally {
          if (readerRef.current) {
            readerRef.current.releaseLock();
            readerRef.current = null;
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      readLoopActiveRef.current = false;
    }
  };

  const startDemoMode = () => {
    if (!isMounted.current) return;

    let index = 0;
    const demoWeights = ['12.50', '15.75', '18.20', '22.35', '25.60', '28.45'];

    resetTracking();
    setWaitingForRollRemoval(false);
    setCurrentWeight('0.00');
    setLastStableWeight('0.00');

    setConnectionStatus('demo');
    setIsConnected(true);

    if (batchActive) {
      setCurrentWeight('12.50');
      setFormData(prev => ({ ...prev, weight: '12.50' }));
    }

    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
    }

    updateInstruction('🎮 Demo mode active! Fill the form and click "Start Batch" to begin', 'info');
    showNotification('Demo mode activated!', 'success');

    demoIntervalRef.current = setInterval(() => {
      if (!isMounted.current) return;

      const isBatchActive = batchActiveRef.current;
      const isWaiting = waitingForRollRemovalRef.current;
      const processing = isProcessingRef.current;
      const rollNum = currentRollNumberRef.current;
      const totalRolls = totalRollsInBatchRef.current;

      if (isBatchActive) {
        if (!isWaiting && !processing && rollNum < totalRolls) {
          const weight = demoWeights[index % demoWeights.length];
          updateWeightDisplay(weight);
          index++;
        }
        else if (isWaiting && !processing) {
          setCurrentWeight('0.00');
        }
      } else {
        setCurrentWeight('0.00');
      }
    }, 2500);
  };

  const stopDemoMode = () => {
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }

    setConnectionStatus('disconnected');
    setIsConnected(false);
    setCurrentWeight('0.00');
    updateInstruction('Demo mode stopped. Click "Connect USB Scale" to use physical scale.', 'info');
    showNotification('Demo mode deactivated', 'info');

    disconnectScale();
  };

  const connectToScale = async () => {
    if (isDisconnectingRef.current) {
      showNotification('Please wait, still disconnecting...', 'warning');
      return;
    }

    setErrorMessage('');
    setConnectionStatus('connecting');
    updateInstruction('Connecting to scale... Please select the USB device', 'info');

    try {
      if ('serial' in navigator) {
        const port = await navigator.serial.requestPort();

        await port.open({
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          flowControl: 'none',
          bufferSize: 255
        });

        portRef.current = port;
        setIsConnected(true);
        setConnectionStatus('connected');
        updateInstruction('✅ Scale connected! Start a batch to begin', 'success');
        showNotification('Scale connected successfully!', 'success');

        startReading(port);
      } else {
        throw new Error('Web Serial API not supported. Please use Chrome or Edge browser.');
      }
    } catch (error) {
      console.error('Connection error:', error);
      setErrorMessage(error.message || 'Failed to connect to weighing scale');
      setConnectionStatus('error');
      setIsConnected(false);
      updateInstruction(`❌ Connection failed: ${error.message}`, 'error');
    }
  };

  // Fetch lot details from Google Sheet
  const handleFetchLotDetails = async () => {
    if (!formData.lotNumber) return;
    setIsFetchingLot(true);
    setFetchError('');
    try {
      const res = await store.fetchDyeingLotDetails(formData.lotNumber.trim());
      if (res.success && res.data) {
        const lotData = res.data;
        setFormData(prev => ({
          ...prev,
          cmfName: lotData.cmfName || prev.cmfName,
          fabricName: lotData.fabricName || prev.fabricName,
          group: lotData.group || prev.group,
          issuedShade: lotData.shade || prev.issuedShade,
          receivedPerson: lotData.receivedPerson || prev.receivedPerson,
          authorizedPerson: lotData.authorizedPerson || prev.authorizedPerson,
        }));

        if (lotData.totalRolls) {
          setTotalRollsInBatch(lotData.totalRolls);
        }

        showNotification(`✓ Lot No #${formData.lotNumber} details auto-filled from Google Sheet!`, 'success');
      } else {
        setFetchError('Failed to fetch details.');
      }
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'Error fetching lot details from Google Sheet.');
      showNotification('❌ Lot fetch failed', 'error');
    } finally {
      setIsFetchingLot(false);
    }
  };

  // Start batch process
  const startBatchProcess = async () => {
    if (!isMounted.current) return;

    let currentBatchNumber = batchNumber;
    if (!currentBatchNumber) {
      currentBatchNumber = `BATCH-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
      setBatchNumber(currentBatchNumber);
    }

    // ALL FIELDS VALIDATION - Make every field required
    if (!formData.cmfName || formData.cmfName.trim() === '') {
      showNotification("❌ CMF Name is required.", "error");
      updateInstruction("❌ Please enter CMF Name", "error");
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
    if (!formData.issuedShade || formData.issuedShade.trim() === '') {
      showNotification("❌ Issued Shade is required.", "error");
      updateInstruction("❌ Please enter Issued Shade", "error");
      return;
    }
    if (!formData.receivedShade || formData.receivedShade.trim() === '') {
      showNotification("❌ Received Shade is required.", "error");
      updateInstruction("❌ Please enter Received Shade", "error");
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
      issuedShade: formData.issuedShade,
      receivedShade: formData.receivedShade,
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
    setWaitingForRollRemoval(false);
    resetTracking();

    if (connectionStatus === 'demo') {
      setCurrentWeight('12.50');
      setFormData(prev => ({ ...prev, weight: '12.50' }));
    } else {
      setCurrentWeight('0.00');
      setLastStableWeight('0.00');
    }

    const nextIdDisplay = nextBarcodeId || 'loading...';
    const successMessage = `✅ Batch started! Batch Number: ${currentBatchNumber}, Expected ${totalRollsInBatch} rolls. Next barcode: ${nextIdDisplay}`;

    updateInstruction(`✅ Batch started! Place roll 1 of ${totalRollsInBatch} on the scale`, 'success');
    showNotification(successMessage, 'success');
  };

  // PRINT FUNCTION - called by Enter key
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

    const currentWeightNum = parseFloat(currentWeight);
    if (currentWeightNum < 0.1) {
      showNotification(`Weight ${currentWeight} KG is too low. Please place roll on scale.`, 'warning');
      return;
    }

    if (waitingForRollRemoval) {
      showNotification('Please remove the previous roll first', 'warning');
      return;
    }

    const rollNum = parseInt(formData.rollNumberInput) || (currentRollNumber + 1);
    setWaitingForRollRemoval(true);
    setIsProcessing(true);
    updateInstruction(`🖨️ Printing sticker for roll ${rollNum}...`, 'info');

    try {
      const barcodeId = await getNextSequentialBarcodeId();
      const currentTime = new Date();
      const timeString = currentTime.toLocaleTimeString();
      const dateString = currentTime.toISOString().split('T')[0];

      const stickerData = {
        cmfName: batchInfo.cmfName,
        fabricName: batchInfo.fabricName,
        group: batchInfo.group,
        shade: formData.receivedShade || batchInfo.issuedShade,
        issuedShade: batchInfo.issuedShade,
        receivedShade: formData.receivedShade,
        weight: currentWeight,
        lotNumber: batchInfo.lotNumber,
        billNumber: formData.billNumber,
        date: batchInfo.date || dateString,
        location: batchInfo.location,
        receivedPerson: batchInfo.receivedPerson,
        authorizedPerson: batchInfo.authorizedPerson,
        rollNumber: rollNum,
        totalRolls: totalRollsInBatch,
        uniqueBarcodeId: barcodeId,
        generatedAt: timeString,
        timestamp: currentTime.toISOString(),
        status: 'in_stock'
      };

      // ── If backend is offline → queue the job and show waiting banner ─
      if (!isOnline) {
        const queuedJob = { stickerData, rollNumber: rollNum };
        setOfflineQueue(prev => [...prev, queuedJob]);
        offlineQueueRef.current = [...offlineQueueRef.current, queuedJob];
        showNotification(`🔴 No network — Roll ${rollNum} queued. Will print when network returns.`, 'warning');
        updateInstruction('🔴 No network! Roll queued — waiting for network to restore...', 'error');
        // still advance roll count so worker can continue placing rolls
        setCompletedRolls(prev => [...prev, {
          rollNumber: rollNum,
          weight: currentWeight,
          barcodeId: barcodeId,
          timestamp: timeString,
          fabricName: batchInfo.fabricName,
          shade: formData.receivedShade || batchInfo.issuedShade,
          queued: true
        }]);
        const newRollNumber = currentRollNumber + 1;
        setCurrentRollNumber(newRollNumber);
        setLastPrintedRoll(rollNum);
        loadNextBarcodeId();
        setCurrentWeight('0.00');
        setFormData(prev => ({ ...prev, weight: '0.00' }));
        if (newRollNumber >= totalRollsInBatch) {
          setBatchActive(false);
          setWaitingForRollRemoval(false);
          updateInstruction('🔴 Batch done. Queued rolls will auto-print when network restores.', 'warning');
        } else {
          setWaitingForRollRemoval(false);
          updateInstruction(`⏳ Roll ${newRollNumber} queued. Place roll ${newRollNumber + 1} of ${totalRollsInBatch}`, 'warning');
        }
        return;
      }

      const stored = await storeDataInGoogleSheets(stickerData, rollNum);

      if (stored) {
        setSubmittedData(stickerData);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && printServiceStatus === 'ready') {
          printViaPythonService(stickerData);
          showNotification(`✓ Roll ${rollNum} sticker printed!`, 'success');
          updateInstruction(`✅ Roll ${rollNum} printed!`, 'success');
        } else {
          showNotification('⚠️ Data saved but print service offline', 'warning');
        }

        setCompletedRolls(prev => [...prev, {
          rollNumber: rollNum,
          weight: currentWeight,
          barcodeId: barcodeId,
          timestamp: timeString,
          fabricName: batchInfo.fabricName,
          shade: formData.receivedShade || batchInfo.issuedShade
        }]);

        const newRollNumber = currentRollNumber + 1;
        setCurrentRollNumber(newRollNumber);
        setLastPrintedRoll(rollNum);
        loadNextBarcodeId();

        setCurrentWeight('0.00');
        setFormData(prev => ({ ...prev, weight: '0.00' }));

        if (newRollNumber >= totalRollsInBatch) {
          showNotification(`🎉 Batch complete!`, 'success');
          setBatchActive(false);
          setWaitingForRollRemoval(false);
          await logBatchCompletion(newRollNumber);
          updateInstruction('🎉 Batch completed! Start a new batch to continue', 'success');
          setActiveSteps(prev => ({ ...prev, step6: true }));
        } else {
          showNotification(`✅ Roll ${newRollNumber} done! Ready for next roll`, 'success');
          updateInstruction(`✅ Roll ${newRollNumber} printed! Place roll ${newRollNumber + 1} of ${totalRollsInBatch} on the scale`, 'success');
          setWaitingForRollRemoval(false);
        }
      }
    } catch (error) {
      console.error('❌ Print error:', error);
      showNotification('Error printing', 'error');
      setWaitingForRollRemoval(false);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
      }, 2000);
    }
  };

  // ── Weight Stabilization Config ──────────────────────────────────────
  const WEIGHT_BUFFER_SIZE = 7;
  const STABLE_COUNT_NEEDED = 4;
  const STABLE_TOLERANCE_KG = 0.15;
  const SPIKE_REJECT_RATIO = 0.30;
  const MIN_VALID_WEIGHT_KG = 1.0;
  const MAX_VALID_WEIGHT_KG = 200.0;

  const updateWeightDisplay = (weight) => {
    const newVal = parseFloat(weight);
    if (isNaN(newVal)) return;

    if (newVal < MIN_VALID_WEIGHT_KG || newVal > MAX_VALID_WEIGHT_KG) {
      setCurrentWeight('0.00');
      return;
    }

    const isProc = isProcessingRef.current;
    const isWait = waitingForRollRemovalRef.current;
    const active = batchActiveRef.current;
    const rollNum = currentRollNumberRef.current;
    const totalRolls = totalRollsInBatchRef.current;

    if (isProc || isWait) return;

    const buf = weightBufferRef.current;
    buf.push(newVal);
    if (buf.length > WEIGHT_BUFFER_SIZE) buf.shift();

    const sorted = [...buf].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    if (buf.length >= 3) {
      const deviation = Math.abs(newVal - median) / (median || 1);
      if (deviation > SPIKE_REJECT_RATIO) {
        console.warn(`⚠️ Spike rejected: ${newVal} KG (median=${median.toFixed(2)} KG, dev=${(deviation * 100).toFixed(0)}%)`);
        return;
      }
    }

    const lastWeight = lastWeightRef.current;
    if (lastWeight !== null && Math.abs(newVal - lastWeight) <= STABLE_TOLERANCE_KG) {
      consecutiveCountRef.current += 1;
    } else {
      consecutiveCountRef.current = 1;
    }
    lastWeightRef.current = newVal;

    const stableEnough = consecutiveCountRef.current >= STABLE_COUNT_NEEDED;
    const displayWeight = median.toFixed(2);

    if (stableEnough) {
      stableWeightValueRef.current = displayWeight;
      setCurrentWeight(displayWeight);
      setFormData(prev => ({ ...prev, weight: displayWeight }));

      if (active && median >= MIN_VALID_WEIGHT_KG && rollNum < totalRolls) {
        updateInstruction(`✅ Weight: ${displayWeight} KG. Press ENTER to print sticker!`, 'success');
        showNotification(`Weight detected: ${displayWeight} KG. Press ENTER to print`, 'info');
      } else if (active && rollNum < totalRolls && median < MIN_VALID_WEIGHT_KG && median > 0) {
        updateInstruction(`⚠️ Weight (${displayWeight} KG) is too low — minimum 1 KG required. Place roll on scale.`, 'warning');
      }
    } else {
      setCurrentWeight(newVal.toFixed(2));
    }
  };

  // ENTER key listener for printing
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();

        const weightNum = parseFloat(currentWeight);
        const isStable = stableWeightValueRef.current !== null;
        const stableVal = parseFloat(stableWeightValueRef.current || '0');

        if (batchActive && !isProcessing && !waitingForRollRemoval && isStable && stableVal >= 1.0 && currentRollNumber < totalRollsInBatch) {
          handlePrint();
        } else {
          if (!batchActive) {
            showNotification('Please start a batch first', 'warning');
          } else if (waitingForRollRemoval) {
            showNotification('Please remove the previous roll first', 'warning');
          } else if (!isStable || weightNum < 1.0) {
            showNotification('⏳ Weight still stabilizing — please wait for a steady reading.', 'warning');
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [batchActive, isProcessing, waitingForRollRemoval, currentWeight, currentRollNumber, totalRollsInBatch]);

  const handleReset = () => {
    setFormData({
      cmfName: DYEING_DEFAULT_DATA.cmfName,
      fabricName: DYEING_DEFAULT_DATA.fabricName,
      group: DYEING_DEFAULT_DATA.group,
      issuedShade: DYEING_DEFAULT_DATA.shade,
      receivedShade: '',
      weight: '',
      lotNumber: DYEING_DEFAULT_DATA.lotNumber,
      billNumber: DYEING_DEFAULT_DATA.billNumber,
      location: '',
      receivedPerson: DYEING_DEFAULT_DATA.receivedPerson,
      authorizedPerson: DYEING_DEFAULT_DATA.authorizedPerson,
      date: new Date().toISOString().split('T')[0],
      rollNumberInput: '1'
    });
    setBatchActive(false);
    setCurrentRollNumber(0);
    setCompletedRolls([]);
    setBatchInfo(null);
    setWaitingForRollRemoval(false);
    resetTracking();
    setCurrentWeight('0.00');
    setLastStableWeight('0.00');
    updateInstruction('Form reset. Default values filled. Set total rolls to start again.', 'info');
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
              <div className="next-barcode-title">Next Barcode ID</div>
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
              Stop & Cancel Remaining Rolls
            </button>

            <div className="barcode-sequential-note">
              <AlertCircle size={12} />
              <span>Sequential barcode IDs (6-digit format: 000001, 000002, ...)</span>
            </div>
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
              <span>Home</span><span>/</span><span>Stock Add</span><span>/</span><span style={{ color: 'var(--primary, #2563EB)' }}>Dyeing Material</span>
            </div>
            <h1 className="gradient-title" style={{ margin: '2px 0 0 0', fontSize: '24px' }}>
              Add Dyeing Material (Processed Stock)
            </h1>
            <p style={{ margin: '3px 0 0 0', color: 'var(--text-muted, #64748B)', fontSize: '12.5px' }}>
              ✨ Pre-filled with dyeing parameters. Connect scale or enter roll weight to print barcode.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/dyeing-material-manual')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 16px',
            borderRadius: '10px',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
            color: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
            transition: 'all 0.2s'
          }}
        >
          <Scale size={16} />
          <span>Switch to Manual Weight Mode ⚡</span>
        </button>
      </div>

      {/* Connection and Instruction Banner */}
      <div className="scale-status-bar">
        <div className="status-indicators">
          <div className="indicator-item">
            <Scale size={16} /> USB Scale:
            <span className={`status-badge ${connectionStatus}`}>
              {connectionStatus}
            </span>
          </div>
          <div className="indicator-item">
            <Printer size={16} /> Printer:
            <span className={`status-badge ${printServiceStatus === 'ready' ? 'connected' : printServiceStatus}`}>
              {printServiceStatus}
            </span>
          </div>

          {/* ── Network / Backend Status Light ── */}
          <div className="indicator-item net-status-item">
            <span
              className={`net-light ${isOnline ? 'net-online' : 'net-offline'} ${isCheckingNetwork ? 'net-checking' : ''}`}
              title={isOnline ? 'Network OK — Backend connected' : 'No network — Backend unreachable'}
            />
            <span className={`net-label ${isOnline ? 'net-online' : 'net-offline'}`}>
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

      {/* ── Offline Queue Warning Banner ── */}
      {!isOnline && (
        <div className="offline-banner">
          <span className="offline-banner-dot" />
          <div className="offline-banner-text">
            <strong>No Network — Waiting for connection...</strong>
            <span>
              {offlineQueue.length > 0
                ? `${offlineQueue.length} roll(s) queued. They will be saved & printed automatically when network returns.`
                : 'Printing and saving is paused. Everything will resume automatically once network is restored.'}
            </span>
          </div>
        </div>
      )}
      {isOnline && offlineQueue.length > 0 && (
        <div className="online-queue-banner">
          <span className="online-queue-dot" />
          <strong>Network restored!</strong>
          <span>Processing {offlineQueue.length} queued roll(s)...</span>
        </div>
      )}

      <div className="fabric-layout-grid">
        {/* Left Side: Scale & Workflow Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Live Weight Dashboard */}
          <div className={`weight-card ${connectionStatus}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="weight-label">Weighing Scale Reading</div>
            <div className="weight-value" style={{ margin: '5px 0' }}>
              {currentWeight} <span className="weight-unit">KG</span>
            </div>
            {connectionStatus === 'disconnected' ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={connectToScale}>
                  Connect USB Scale
                </button>
                <button className="btn btn-secondary btn-sm" onClick={startDemoMode}>
                  Demo Mode
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary btn-sm" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white' }} onClick={connectionStatus === 'demo' ? stopDemoMode : disconnectScale}>
                  Disconnect
                </button>
                <button className="btn btn-secondary btn-sm" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white' }} onClick={resetSerialConnection}>
                  Reset Port
                </button>
              </div>
            )}
            {connectionStatus === 'connected' && (
              <div className="weight-status-indicator" style={{ marginTop: 5 }}>
                <span className="live-dot" /> Live WebSerial stream
              </div>
            )}
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
                  gap: 8
                }}
                onClick={handlePrint}
                disabled={isProcessing || parseFloat(currentWeight) < 0.1 || waitingForRollRemoval}
              >
                <Printer size={18} /> Print Sticker & Save Roll
              </button>
            )}
          </div>

          {/* Interactive Steps Card */}
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
                <div className="step-label">Connect USB Weighing Scale or Demo Mode</div>
              </div>
              <div className={`step-row ${activeSteps.step3 && !activeSteps.step4 ? 'active' : activeSteps.step4 ? 'completed' : ''}`}>
                <div className="step-num">{activeSteps.step4 ? '✓' : '4'}</div>
                <div className="step-label">Click "Start Batch" to lock details</div>
              </div>
              <div className={`step-row ${activeSteps.step4 && !activeSteps.step5 ? 'active' : activeSteps.step5 ? 'completed' : ''}`}>
                <div className="step-num">{activeSteps.step5 ? '✓' : '5'}</div>
                <div className="step-label">Place roll on scale ({currentRollNumber + 1} of {totalRollsInBatch}) & press ENTER to print</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Batch Config, Form Details, & Roll History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Batch Configuration */}
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
                  disabled={batchActive}
                />
              </div>

              {batchActive && (
                <div className="form-group" style={{ width: 140 }}>
                  <label className="form-label">Active Roll Number</label>
                  <input
                    className="form-control"
                    type="number"
                    value={formData.rollNumberInput}
                    onChange={e => handleInputChange('rollNumberInput', e.target.value)}
                    min="1"
                  />
                </div>
              )}

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

          {/* Form Fields Card */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Dyeing Roll Metadata Details</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Lot Number lookup section */}
              <div className="form-group" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: 16, marginBottom: 6 }}>
                <label className="form-label">Lot Number <span className="required">*</span></label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    className="form-control"
                    placeholder="Enter Lot Number (e.g. 76038)"
                    value={formData.lotNumber}
                    onChange={e => handleInputChange('lotNumber', e.target.value)}
                    disabled={batchActive}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleFetchLotDetails}
                    disabled={batchActive || isFetchingLot || !formData.lotNumber}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120, justifyContent: 'center' }}
                  >
                    {isFetchingLot ? 'Searching...' : '🔍 Fetch Details'}
                  </button>
                </div>
                {fetchError && (
                  <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} /> {fetchError}
                  </div>
                )}
              </div>

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
                <div className="form-group" style={{ display: 'flex', gap: 10, flex: 1 }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Issued Shade <span className="required">*</span></label>
                    <input className="form-control" placeholder="Prefilled from Lot" value={formData.issuedShade} disabled={true} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Received Shade <span className="required">*</span></label>
                    <MasterDropdown
                      type="shade"
                      value={formData.receivedShade}
                      onChange={val => handleInputChange('receivedShade', val)}
                      placeholder="Select or add Shade..."
                    />
                  </div>
                </div>
              </div>

              <div className="compact-form-row">
                <div className="form-group">
                  <label className="form-label">Bill Number <span className="required">*</span></label>
                  <input className="form-control" placeholder="e.g. BILL-9921" value={formData.billNumber} onChange={e => handleInputChange('billNumber', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label"> Date <span className="required">*</span></label>
                  <input className="form-control" type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} disabled={batchActive} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Location <span className="required">*</span></label>
                <LocationPicker
                  value={formData.location}
                  onChange={val => handleInputChange('location', val)}
                  disabled={batchActive}
                />
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

          {/* Processing and Sticker preview */}
          {isProcessing && (
            <div className="printing-overlay">
              <Printer className="animate-spin" size={20} />
              <span>Generating sticker and syncing to database...</span>
            </div>
          )}

          {/* Active / Completed Roll Listing */}
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
                      <th>Weight</th>
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
                          <td style={{ fontWeight: 700 }}>{roll.weight} KG</td>
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

      {/* Stop Confirmation Modal */}
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

export default DyeingMaterialForm;

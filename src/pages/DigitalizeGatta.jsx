// DigitalizeGatta.jsx - Two Column Layout with Royal Blue Theme & Advanced Filters

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scissors, Cpu, UploadCloud } from 'lucide-react';
import '../Design/DigitalizeGatta.css';

// Sticker Dimensions
const STICKER_WIDTH_MM = 61;
const STICKER_HEIGHT_MM = 44.36;

// Google Apps Script URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyOytDVMKYbDwKBFAhMX0ca5MpcRTiccy9__f_ofOtwFig8PkHNQafh923x81NKggqkew/exec';

// Spreadsheet configuration
const SPREADSHEET_ID = '1n_hG3rOH3G0O2ijYAv-pxj_keDxkLZAef2SV0Nw7TPk';
const STICKER_PRINTS_SHEET_NAME = 'StickerPrints';
const STICKER_PRINTS_RANGE = `${STICKER_PRINTS_SHEET_NAME}!A:O`;

function DigitalizeGatta() {
  const navigate = useNavigate();
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [partyCodeMap, setPartyCodeMap] = useState({});
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedBillNumber, setSelectedBillNumber] = useState('');
  const [availableBills, setAvailableBills] = useState([]);
  const [showStickerPreview, setShowStickerPreview] = useState(false);
  const [stickerGroups, setStickerGroups] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [useManualLocation, setUseManualLocation] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [receivedPerson, setReceivedPerson] = useState('');
  const [authorizedPerson, setAuthorizedPerson] = useState('');
  const [selectedBillSummary, setSelectedBillSummary] = useState(null);
  const [activeStep, setActiveStep] = useState(1);
  const [isSavingToSheet, setIsSavingToSheet] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [dateSortConfig, setDateSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [billSortConfig, setBillSortConfig] = useState({ key: 'billNumber', direction: 'asc' });
  const [dateSearchTerm, setDateSearchTerm] = useState('');
  const [billSearchTerm, setBillSearchTerm] = useState('');
  
  // New state for tracking printed bills
  const [printedBills, setPrintedBills] = useState(new Set());
  const [loadingPrintHistory, setLoadingPrintHistory] = useState(true);

  // ========== NEW FILTER STATES ==========
  // Date Filter States
  const [dateFilterMonth, setDateFilterMonth] = useState('');
  const [dateFilterYear, setDateFilterYear] = useState('');
  const [dateFilterBillRange, setDateFilterBillRange] = useState({ min: '', max: '' });
  const [showDateFilters, setShowDateFilters] = useState(false);

  // Bill Filter States
  const [billFilterMinRolls, setBillFilterMinRolls] = useState('');
  const [billFilterMaxRolls, setBillFilterMaxRolls] = useState('');
  const [billFilterMinWeight, setBillFilterMinWeight] = useState('');
  const [billFilterMaxWeight, setBillFilterMaxWeight] = useState('');
  const [billFilterMinCategories, setBillFilterMinCategories] = useState('');
  const [billFilterMaxCategories, setBillFilterMaxCategories] = useState('');
  const [billFilterStatus, setBillFilterStatus] = useState('all');
  const [showBillFilters, setShowBillFilters] = useState(false);

  // Available months and years for filter dropdowns
  const availableMonths = useMemo(() => {
    const months = new Set();
    allData.forEach(item => {
      if (item['Rect Date']) {
        const date = new Date(item['Rect Date']);
        if (!isNaN(date.getTime())) {
          months.add(date.toLocaleString('default', { month: 'long' }));
        }
      }
    });
    return Array.from(months).sort();
  }, [allData]);

  const availableYears = useMemo(() => {
    const years = new Set();
    allData.forEach(item => {
      if (item['Rect Date']) {
        const date = new Date(item['Rect Date']);
        if (!isNaN(date.getTime())) {
          years.add(date.getFullYear());
        }
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allData]);

  const API_BASE_URL = 'https://new-fabric-backend-1.onrender.com/api/google-sheets';
  const PARTY_CODES_SHEET_ID = SPREADSHEET_ID;
  const PARTY_CODES_API_KEY = 'AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk';
  const PARTY_CODES_RANGE = 'FABRIC PTY!A:B';

  // Handle back navigation using window.history.back
  const handleGoBack = () => {
    window.history.back();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return dateString; }
  };

  // Fetch sticker print history from Google Sheet
  const fetchStickerPrintHistory = useCallback(async () => {
    try {
      setLoadingPrintHistory(true);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${STICKER_PRINTS_RANGE}?key=${PARTY_CODES_API_KEY}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`Failed to fetch sticker prints: ${response.status}`);
        return new Set();
      }
      
      const result = await response.json();
      
      if (result.values && result.values.length > 0) {
        const headers = result.values[0];
        const billNumberIndex = headers.findIndex(header => 
          header && header.toLowerCase().includes('bill') && header.toLowerCase().includes('number')
        );
        
        if (billNumberIndex === -1) {
          console.warn('Bill Number column not found in StickerPrints sheet');
          return new Set();
        }
        
        const printedBillSet = new Set();
        
        for (let i = 1; i < result.values.length; i++) {
          const row = result.values[i];
          const billNumber = row[billNumberIndex]?.trim();
          
          if (billNumber && billNumber !== '' && billNumber !== 'Bill Number') {
            const stickerPrintedIndex = headers.findIndex(header => 
              header && header.toLowerCase().includes('sticker printed')
            );
            
            const stickerPrinted = stickerPrintedIndex !== -1 ? row[stickerPrintedIndex]?.trim() : '';
            
            if (stickerPrinted && stickerPrinted.includes('Printed')) {
              printedBillSet.add(billNumber);
            }
          }
        }
        
        console.log(`Found ${printedBillSet.size} bills with existing sticker prints:`, Array.from(printedBillSet));
        return printedBillSet;
      }
      
      return new Set();
    } catch (err) {
      console.error('Error fetching sticker print history:', err);
      return new Set();
    } finally {
      setLoadingPrintHistory(false);
    }
  }, [PARTY_CODES_API_KEY]);

  const savePrintDataToSheet = useCallback(async (billNumber, stickerGroups, selectedGroups) => {
    try {
      setIsSavingToSheet(true);
      const currentDate = new Date().toLocaleDateString('en-IN');
      const categoriesCount = selectedGroups.length;
      const totalStickers = selectedGroups.reduce((total, group) => {
        return total + Math.round(group.totalRolls);
      }, 0);
      const user = receivedPerson || authorizedPerson || 'Anonymous';
      
      const printData = {
        billNumber: billNumber,
        stickerPrinted: `Printed ${totalStickers} stickers for ${categoriesCount} categories`,
        date: currentDate,
        user: user,
        categoriesCount: categoriesCount,
        totalStickers: totalStickers,
        timestamp: new Date().toISOString()
      };
      
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(printData)
      });
      
      setPrintedBills(prev => new Set([...prev, billNumber]));
      
      return true;
    } catch (error) {
      console.error('Error saving to Google Sheet:', error);
      return false;
    } finally {
      setIsSavingToSheet(false);
    }
  }, [receivedPerson, authorizedPerson]);

  const getCodedPartyName = useCallback((partyName) => {
    if (!partyName || partyName === 'N/A' || partyName === '-') return 'N/A';
    if (partyCodeMap[partyName]) return partyCodeMap[partyName];
    const prefix = partyName.substring(0, 3).toUpperCase();
    const hash = Math.abs(partyName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 1000);
    return `${prefix}${hash}`;
  }, [partyCodeMap]);

  const fetchPartyCodes = useCallback(async () => {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${PARTY_CODES_SHEET_ID}/values/${PARTY_CODES_RANGE}?key=${PARTY_CODES_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      if (result.values && result.values.length > 0) {
        const codeMap = {};
        const startRow = result.values[0][0].toLowerCase().includes('party') ? 1 : 0;
        for (let i = startRow; i < result.values.length; i++) {
          const row = result.values[i];
          if (row[0] && row[1]) codeMap[row[0].trim()] = row[1].trim();
        }
        setPartyCodeMap(codeMap);
      }
    } catch (err) {
      console.error('Error fetching party codes:', err);
      setPartyCodeMap({});
    }
  }, []);

  const fetchAllStockData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/search/barcode/all-data`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      if (result.success && result.data) {
        const transformedData = result.data.map(row => ({
          'Timestamp': row.Timestamp || row['Timestamp'] || '',
          'Barcode ID': row['Barcode ID'] || row.barcodeId || '',
          'Item Description': row['Item Description'] || row.fabricName || row['Fabric Name'] || '',
          'Unit': row.Unit || row['Unit'] || 'KG',
          'Shade': row.Shade || row['Shade'] || '',
          'Lot No': row['Lot No'] || row.lotNumber || '',
          'Rect Date': row['Rect Date'] || row.rectDate || '',
          'Party': row.Party || row['Party'] || row.cmfName || '',
          'Store': row.Store || row['Store'] || '',
          'Bal Pkgs': parseFloat(row['Bal Pkgs'] || row.balPkgs || 0),
          'Bal WT': parseFloat(row['Bal WT'] || row.balWT || 0),
          'Bill Number': row['Bill Number'] || row.billNumber || row['Bill No'] || row.billNo || ''
        }));
        setAllData(transformedData);
        setLastUpdated(new Date().toLocaleString());
      } else {
        throw new Error(result.message || 'No data received from API');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    const loadInitialData = async () => {
      await fetchAllStockData();
      await fetchPartyCodes();
      const printedSet = await fetchStickerPrintHistory();
      setPrintedBills(printedSet);
    };
    
    loadInitialData();
  }, [fetchAllStockData, fetchPartyCodes, fetchStickerPrintHistory]);

  // ========== FILTERED UNIQUE DATES ==========
  const uniqueDates = useMemo(() => {
    const datesMap = new Map();
    allData.forEach(item => {
      if (item['Rect Date']) {
        const date = item['Rect Date'].split('T')[0];
        if (!datesMap.has(date)) {
          const billCount = new Set();
          allData.forEach(i => {
            const iDate = i['Rect Date']?.split('T')[0];
            if (iDate === date && i['Bill Number']) {
              billCount.add(i['Bill Number']);
            }
          });
          datesMap.set(date, billCount.size);
        }
      }
    });
    
    let dates = Array.from(datesMap.entries()).map(([date, billCount]) => ({
      date, billCount, formattedDate: formatDate(date),
      day: new Date(date).getDate(),
      month: new Date(date).toLocaleString('default', { month: 'long' }),
      monthShort: new Date(date).toLocaleString('default', { month: 'short' }),
      year: new Date(date).getFullYear()
    }));
    
    // Apply Date Filters
    dates = dates.filter(date => {
      if (dateFilterMonth && date.month !== dateFilterMonth) return false;
      if (dateFilterYear && date.year !== parseInt(dateFilterYear)) return false;
      if (dateFilterBillRange.min && date.billCount < parseInt(dateFilterBillRange.min)) return false;
      if (dateFilterBillRange.max && date.billCount > parseInt(dateFilterBillRange.max)) return false;
      if (dateSearchTerm) {
        return date.date.includes(dateSearchTerm) ||
          date.formattedDate.toLowerCase().includes(dateSearchTerm.toLowerCase());
      }
      return true;
    });
    
    dates.sort((a, b) => {
      if (dateSortConfig.key === 'date') {
        return dateSortConfig.direction === 'asc' 
          ? new Date(a.date) - new Date(b.date)
          : new Date(b.date) - new Date(a.date);
      } else if (dateSortConfig.key === 'billCount') {
        return dateSortConfig.direction === 'asc'
          ? a.billCount - b.billCount
          : b.billCount - a.billCount;
      }
      return 0;
    });
    
    return dates;
  }, [allData, dateSortConfig, dateSearchTerm, formatDate, dateFilterMonth, dateFilterYear, dateFilterBillRange]);

  const getBillsForDate = useCallback((date) => {
    if (!date) return [];
    const billsMap = new Map();
    allData.forEach(item => {
      const itemDate = item['Rect Date']?.split('T')[0];
      if (itemDate === date && item['Bill Number']) {
        const billNumber = item['Bill Number'];
        if (!billsMap.has(billNumber)) {
          let totalRolls = 0, totalWeight = 0, categories = 0;
          const billItems = allData.filter(i => 
            i['Rect Date']?.split('T')[0] === date && i['Bill Number'] === billNumber
          );
          const uniqueCategories = new Set();
          billItems.forEach(i => {
            totalRolls += parseFloat(i['Bal Pkgs']) || 0;
            totalWeight += parseFloat(i['Bal WT']) || 0;
            uniqueCategories.add(`${i['Item Description']}|${i['Shade']}`);
          });
          billsMap.set(billNumber, {
            billNumber, totalRolls: totalRolls.toFixed(0),
            totalWeight: totalWeight.toFixed(1), categories: uniqueCategories.size,
            itemsCount: billItems.length,
            isPrinted: printedBills.has(billNumber)
          });
        }
      }
    });
    
    let bills = Array.from(billsMap.values());
    
    // Apply Bill Filters
    bills = bills.filter(bill => {
      const rolls = parseFloat(bill.totalRolls);
      if (billFilterMinRolls && rolls < parseFloat(billFilterMinRolls)) return false;
      if (billFilterMaxRolls && rolls > parseFloat(billFilterMaxRolls)) return false;
      
      const weight = parseFloat(bill.totalWeight);
      if (billFilterMinWeight && weight < parseFloat(billFilterMinWeight)) return false;
      if (billFilterMaxWeight && weight > parseFloat(billFilterMaxWeight)) return false;
      
      const categories = bill.categories;
      if (billFilterMinCategories && categories < parseFloat(billFilterMinCategories)) return false;
      if (billFilterMaxCategories && categories > parseFloat(billFilterMaxCategories)) return false;
      
      if (billFilterStatus === 'available' && bill.isPrinted) return false;
      if (billFilterStatus === 'printed' && !bill.isPrinted) return false;
      
      if (billSearchTerm) {
        return bill.billNumber.toLowerCase().includes(billSearchTerm.toLowerCase());
      }
      
      return true;
    });
    
    bills.sort((a, b) => {
      if (billSortConfig.key === 'billNumber') {
        return billSortConfig.direction === 'asc'
          ? a.billNumber.localeCompare(billNumber)
          : b.billNumber.localeCompare(a.billNumber);
      } else if (billSortConfig.key === 'totalRolls') {
        return billSortConfig.direction === 'asc'
          ? parseFloat(a.totalRolls) - parseFloat(b.totalRolls)
          : parseFloat(b.totalRolls) - parseFloat(a.totalRolls);
      } else if (billSortConfig.key === 'totalWeight') {
        return billSortConfig.direction === 'asc'
          ? parseFloat(a.totalWeight) - parseFloat(b.totalWeight)
          : parseFloat(b.totalWeight) - parseFloat(a.totalWeight);
      } else if (billSortConfig.key === 'categories') {
        return billSortConfig.direction === 'asc'
          ? a.categories - b.categories
          : b.categories - a.categories;
      }
      return 0;
    });
    
    return bills;
  }, [allData, billSortConfig, billSearchTerm, printedBills, billFilterMinRolls, billFilterMaxRolls, billFilterMinWeight, billFilterMaxWeight, billFilterMinCategories, billFilterMaxCategories, billFilterStatus]);

  useEffect(() => {
    if (selectedDate) {
      const bills = getBillsForDate(selectedDate);
      setAvailableBills(bills);
      setSelectedBillNumber('');
      setSelectedBillSummary(null);
      setShowStickerPreview(false);
      setActiveStep(2);
    } else {
      setAvailableBills([]);
      setSelectedBillNumber('');
      setSelectedBillSummary(null);
      setShowStickerPreview(false);
      setActiveStep(1);
    }
  }, [selectedDate, getBillsForDate]);

  const getBillItems = useCallback((billNumber, date) => {
    if (!billNumber || !date) return [];
    return allData.filter(item => {
      const itemDate = item['Rect Date']?.split('T')[0];
      return item['Bill Number'] === billNumber && itemDate === date;
    });
  }, [allData]);

  const escapeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const getFabricShadeGroups = useCallback((billData) => {
    const groups = new Map();
    billData.forEach(item => {
      const fabric = item['Item Description'] || 'Unknown';
      const shade = item['Shade'] || 'Unknown';
      const key = `${fabric}|${shade}`;
      if (!groups.has(key)) {
        groups.set(key, {
          fabric, shade, items: [], totalRolls: 0, totalWeight: 0,
          party: item['Party'] || 'N/A', codedParty: getCodedPartyName(item['Party']),
          storeLocation: item['Store'] || 'GODOWN', lotNumbers: new Set(),
          billNumber: item['Bill Number']
        });
      }
      const group = groups.get(key);
      group.items.push(item);
      group.totalRolls += parseFloat(item['Bal Pkgs']) || 0;
      group.totalWeight += parseFloat(item['Bal WT']) || 0;
      if (item['Lot No']) group.lotNumbers.add(item['Lot No']);
      if (item['Store']) group.storeLocation = item['Store'];
    });
    return Array.from(groups.values()).map(group => ({
      ...group, lotNumbers: Array.from(group.lotNumbers).join(', ')
    }));
  }, [getCodedPartyName]);

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setSelectedBillNumber('');
    setSelectedBillSummary(null);
    setShowStickerPreview(false);
    setActiveStep(2);
  };

  const handleBillSelect = (billNumber) => {
    if (printedBills.has(billNumber)) {
      alert(`⚠️ Bill ${billNumber} has already had stickers printed before!\n\nYou cannot re-print stickers for this bill.`);
      return;
    }
    
    setSelectedBillNumber(billNumber);
    const billItems = getBillItems(billNumber, selectedDate);
    const groups = getFabricShadeGroups(billItems);
    let totalWeight = 0, totalRolls = 0;
    billItems.forEach(item => {
      totalWeight += parseFloat(item['Bal WT']) || 0;
      totalRolls += parseFloat(item['Bal Pkgs']) || 0;
    });
    setSelectedBillSummary({
      billNumber, totalItems: billItems.length,
      totalWeight: totalWeight.toFixed(1), totalRolls: totalRolls.toFixed(0),
      categories: groups.length
    });
    setStickerGroups(groups);
    setSelectedCategories(groups.map((_, index) => index));
    setSelectAll(true);
    setShowStickerPreview(true);
    setActiveStep(3);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedCategories([]);
      setSelectAll(false);
    } else {
      setSelectedCategories(stickerGroups.map((_, index) => index));
      setSelectAll(true);
    }
  };

  const handleUploadCopyClick = () => {
    navigate('/fabric-copy/upload-copy');
  };

  const resetDateFilters = () => {
    setDateFilterMonth('');
    setDateFilterYear('');
    setDateFilterBillRange({ min: '', max: '' });
    setDateSearchTerm('');
    setDateSortConfig({ key: 'date', direction: 'desc' });
  };

  const resetBillFilters = () => {
    setBillFilterMinRolls('');
    setBillFilterMaxRolls('');
    setBillFilterMinWeight('');
    setBillFilterMaxWeight('');
    setBillFilterMinCategories('');
    setBillFilterMaxCategories('');
    setBillFilterStatus('all');
    setBillSearchTerm('');
    setBillSortConfig({ key: 'billNumber', direction: 'asc' });
  };

  const handlePrintStickers = useCallback(async () => {
    const selectedGroups = stickerGroups.filter((_, index) => selectedCategories.includes(index));
    
    if (selectedGroups.length === 0) {
      alert('Please select at least one category to print');
      return;
    }
    
    if (printedBills.has(selectedBillNumber)) {
      alert(`❌ Cannot print: Bill ${selectedBillNumber} has already been printed!\n\nStickers for this bill were already generated.`);
      return;
    }

    await savePrintDataToSheet(selectedBillNumber, stickerGroups, selectedGroups);

    const useManualLoc = useManualLocation && manualLocation.trim() !== '';
    const receivedBy = receivedPerson.trim() || 'STORE KEEPER';
    const authorizedBy = authorizedPerson.trim() || 'MANAGER';
    
    const printWindow = window.open('', '_blank');
    
    if (printWindow) {
      const stickersHtml = selectedGroups.map((group) => {
        const displayParty = group.codedParty || getCodedPartyName(group.party);
        const lotNumbers = group.lotNumbers || 'N/A';
        const rollsCount = Math.round(group.totalRolls);
        const weight = group.totalWeight.toFixed(1);
        const billNumber = group.billNumber || selectedBillNumber;
        const storeLocation = group.storeLocation || 'GODOWN';
        
        let locationDisplay = '';
        if (useManualLoc) {
          locationDisplay = `<div class="print-detail-row"><span class="print-detail-label">LOC:</span><span class="print-detail-value">${escapeHtml(manualLocation)}</span></div>`;
        } else if (storeLocation && storeLocation !== 'GODOWN') {
          locationDisplay = `<div class="print-detail-row"><span class="print-detail-label">STORE:</span><span class="print-detail-value">${escapeHtml(storeLocation)}</span></div>`;
        }
        
        return `
          <div class="print-sticker">
            <div class="print-sticker-content">
              <div class="print-party-name">${escapeHtml(displayParty)}</div>
              <div class="print-fabric-name">${escapeHtml(group.fabric)}</div>
              <div class="print-shade-name">${escapeHtml(group.shade)}</div>
              <div class="print-divider"></div>
              <div class="print-details-grid">
                <div class="print-detail-row">
                  <span class="print-detail-label">LOT:</span>
                  <span class="print-detail-value">${escapeHtml(lotNumbers)}</span>
                </div>
                <div class="print-detail-row">
                  <span class="print-detail-label">BILL:</span>
                  <span class="print-detail-value">${escapeHtml(billNumber)}</span>
                </div>
                <div class="print-detail-row">
                  <span class="print-detail-label">ROLLS:</span>
                  <span class="print-detail-value">${rollsCount}</span>
                </div>
                <div class="print-detail-row">
                  <span class="print-detail-label">WEIGHT:</span>
                  <span class="print-detail-value">${weight} KG</span>
                </div>
                ${locationDisplay}
              </div>
              <div class="print-footer-row">
                <div class="print-received">R: ${escapeHtml(receivedBy)}</div>
                <div class="print-authorized">A: ${escapeHtml(authorizedBy)}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Stickers - Bill ${escapeHtml(selectedBillNumber)}</title>
            <meta charset="UTF-8">
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { background: white; padding: 0; margin: 0; }
              .print-stickers-container { display: flex; flex-wrap: wrap; gap: 0; background: white; }
              .print-sticker { width: 61mm; height: 40.6mm; margin: 0; padding: 0; background: white; page-break-after: avoid; page-break-inside: avoid; break-inside: avoid; box-sizing: border-box; }
              .print-sticker-content { width: 100%; height: 100%; padding: 6px 8px; background: white; display: flex; flex-direction: column; justify-content: space-between; border: 0.5px solid #e0e0e0; }
              .print-party-name { font-size: 14px; font-weight: 700; text-align: center; text-transform: uppercase; margin: 3px 0; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000000; }
              .print-fabric-name { font-size: 11px; font-weight: 700; text-align: center; margin: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000000; }
              .print-shade-name { font-size: 9px; font-weight: 700; text-align: center; color: #000000; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              .print-divider { height: 1px; background: #000000; margin: 4px 0; }
              .print-details-grid { flex: 1; display: flex; flex-direction: column; gap: 3px; margin: 4px 0; }
              .print-detail-row { display: flex; align-items: baseline; gap: 6px; font-size: 9px; line-height: 1.3; }
              .print-detail-label { font-weight: 700; min-width: 42px; color: #000000; letter-spacing: 0.3px; }
              .print-detail-value { font-weight: 700; color: #000000; word-break: break-word; flex: 1; }
              .print-footer-row { display: flex; justify-content: space-between; margin-top: 4px; padding-top: 3px; border-top: 1px dashed #000000; font-size: 7px; font-weight: 700; }
              .print-received, .print-authorized { font-family: 'Courier New', monospace; color: #000000; font-weight: 700; }
              @media print {
                body { margin: 0; padding: 0; background: white; }
                .print-sticker { break-inside: avoid; page-break-after: avoid; border: none; }
                .print-sticker-content { border: 0.5px solid #ddd; }
                @page { size: 61mm 40.6mm; margin: 0mm; }
              }
            </style>
          </head>
          <body>
            <div class="print-stickers-container">${stickersHtml}</div>
            <script>
              window.onload = function() {
                setTimeout(function() { 
                  window.print(); 
                  setTimeout(function() { 
                    window.close(); 
                  }, 500); 
                }, 300);
              };
            <\/script>
          </body>
        </html>
      `);
      
      printWindow.document.close();
      printWindow.focus();
      
      setTimeout(() => {
        alert(`✅ ${selectedGroups.length} categories printed successfully!\n📊 Print data saved.\n\nBill ${selectedBillNumber} will not be available for re-printing.`);
      }, 1000);
    } else {
      alert('Please allow pop-ups for this site to print stickers.');
    }
  }, [stickerGroups, selectedCategories, selectedBillNumber, useManualLocation, manualLocation, receivedPerson, authorizedPerson, getCodedPartyName, savePrintDataToSheet, printedBills]);

  const handleRefresh = () => {
    fetchAllStockData();
    fetchPartyCodes();
    fetchStickerPrintHistory().then(printedSet => {
      setPrintedBills(printedSet);
    });
    setSelectedDate('');
    setSelectedBillNumber('');
    setShowStickerPreview(false);
    setActiveStep(1);
    resetDateFilters();
    resetBillFilters();
  };

  const getSortIcon = (column, currentConfig) => {
    if (currentConfig.key !== column) return '↕️';
    return currentConfig.direction === 'asc' ? '↑' : '↓';
  };

  // Calculate totals for stats
  const totalRolls = allData.reduce((sum, item) => sum + (parseFloat(item['Bal Pkgs']) || 0), 0);
  const totalWeight = allData.reduce((sum, item) => sum + (parseFloat(item['Bal WT']) || 0), 0);
  const uniqueBills = new Set(allData.map(item => item['Bill Number']).filter(Boolean)).size;

  if (loading && allData.length === 0) {
    return (
      <div className="digitalize-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <h2>Loading Digitalization Suite...</h2>
          <p>Preparing your inventory data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="digitalize-container">
        <div className="error-screen">
          <div className="error-icon">⚠️</div>
          <h2>Connection Error</h2>
          <p>{error}</p>
          <button onClick={fetchAllStockData} className="btn-primary">Retry Connection</button>
        </div>
      </div>
    );
  }

  // Info Card Component for Theoretical Information
  const InfoCard = ({ title, icon, children, color = "blue" }) => (
    <div className={`info-card info-card-${color}`}>
      <div className="info-card-header">
        <span className="info-card-icon">{icon}</span>
        <h4>{title}</h4>
      </div>
      <div className="info-card-content">{children}</div>
    </div>
  );

  // Left Column Component - Contains all theoretical info
  const LeftColumn = () => (
    <div className="left-column">
      {/* Back Button - Added at the top of left column */}
      <button onClick={handleGoBack} className="back-nav-btn" title="Go Back">
        <span>←</span> Back
      </button>

      {/* Stats Overview Card */}
      <div className="stats-overview-card">
        <div className="stats-title">
          <span>📊</span> Inventory Overview
        </div>
        <div className="stats-grid">
          <div className="stat-item-column">
            <span className="stat-label-column">Total Items</span>
            <span className="stat-value-column">{allData.length.toLocaleString()}</span>
          </div>
          <div className="stat-item-column">
            <span className="stat-label-column">Total Rolls</span>
            <span className="stat-value-column">{totalRolls.toLocaleString()}</span>
          </div>
          <div className="stat-item-column">
            <span className="stat-label-column">Total Weight</span>
            <span className="stat-value-column">{totalWeight.toFixed(0)} KG</span>
          </div>
          <div className="stat-item-column">
            <span className="stat-label-column">Unique Bills</span>
            <span className="stat-value-column">{uniqueBills}</span>
          </div>
          <div className="stat-item-column">
            <span className="stat-label-column">Bills Printed</span>
            <span className="stat-value-column">{printedBills.size}</span>
          </div>
          <div className="stat-item-column">
            <span className="stat-label-column">Party Codes</span>
            <span className="stat-value-column">{Object.keys(partyCodeMap).length}</span>
          </div>
        </div>
      </div>

      {/* Step-specific Info Cards */}
      {activeStep === 1 && (
        <>
          <InfoCard title="How It Works" icon="📋" color="blue">
            <p>Digitalize Gatta helps you generate warehouse stickers for received fabrics. Each sticker includes party code, fabric details, lot numbers, and quantity information for easy identification and tracking.</p>
          </InfoCard>
          
          <InfoCard title="Sticker Format" icon="🏷️" color="green">
            <p>Stickers are printed in 61mm × 44.36mm size, optimized for standard thermal printers. Each sticker contains party code, fabric name, shade, lot numbers, roll count, weight, and location details.</p>
          </InfoCard>
          
          <InfoCard title="Benefits" icon="✨" color="orange">
            <ul className="benefits-list">
              <li>No manual sticker writing</li>
              <li>Consistent format across all bills</li>
              <li>Print history tracking</li>
              <li>Prevents duplicate printing</li>
            </ul>
          </InfoCard>
        </>
      )}

      {activeStep === 2 && (
        <>
          <InfoCard title="Selected Date" icon="📅" color="blue">
            <p className="info-highlight">{formatDate(selectedDate)}</p>
            <p className="info-subtext">Viewing all bills received on this date. Each bill represents a unique supplier invoice.</p>
          </InfoCard>
          
          <InfoCard title="Bill Status" icon="🔖" color="green">
            <p><strong>Available</strong> - Bill can be printed</p>
            <p><strong>Already Printed</strong> - Stickers were already generated for this bill</p>
            <p className="info-subtext mt-2">Once printed, bills are locked to prevent duplicate stickers.</p>
          </InfoCard>
          
          <InfoCard title="What's Included" icon="📊" color="orange">
            <ul className="benefits-list">
              <li>Total rolls in the bill</li>
              <li>Total weight in KG</li>
              <li>Number of unique fabric categories</li>
              <li>Current print status</li>
            </ul>
          </InfoCard>
        </>
      )}

      {activeStep === 3 && selectedBillSummary && (
        <>
          <InfoCard title="Bill Summary" icon="📄" color="blue">
            <p><strong>Bill #{selectedBillSummary.billNumber}</strong></p>
            <p>{selectedBillSummary.categories} categories • {selectedBillSummary.totalRolls} rolls • {selectedBillSummary.totalWeight} KG</p>
          </InfoCard>
          
          <InfoCard title="Sticker Specs" icon="📏" color="green">
            <p>Size: 61mm × 44.36mm</p>
            <p>Compatible with standard thermal label printers</p>
            <p>Each sticker contains all necessary warehouse info</p>
          </InfoCard>
          
          <InfoCard title="Print Tracking" icon="🖨️" color="orange">
            <p>Every print is logged in Google Sheets</p>
            <p>Includes: timestamp, user, and sticker count</p>
            <p>Prevents duplicate printing across sessions</p>
          </InfoCard>
        </>
      )}

      {/* Quick Guide - Always Visible */}
      <div className="quick-guide-card">
        <div className="quick-guide-title">
          <span>📌</span> Quick Guide
        </div>
        <div className="guide-steps">
          <div className="guide-step-left">
            <div className="guide-number-left">1</div>
            <div className="guide-text-left">Select the date when goods were received</div>
          </div>
          <div className="guide-step-left">
            <div className="guide-number-left">2</div>
            <div className="guide-text-left">Choose the bill number from available options</div>
          </div>
          <div className="guide-step-left">
            <div className="guide-number-left">3</div>
            <div className="guide-text-left">Select categories and print warehouse stickers</div>
          </div>
        </div>
      </div>

      {/* Tips Card */}
      <div className="tips-card">
        <div className="tips-header">
          <span className="tips-icon">💡</span>
          <h4>Pro Tips</h4>
        </div>
        <ul className="tips-list">
          <li>Use filters to narrow down your search quickly</li>
          <li>Printed bills are locked to prevent duplicates</li>
          <li>Manual location overrides auto-detected store</li>
          <li>Authorized names appear on every sticker</li>
        </ul>
      </div>

      {/* Educational Note */}
      <div className="educational-note-card">
        <p>📚 <strong>Did you know?</strong> Each sticker includes a unique party code that helps identify suppliers across different bills. The system prevents duplicate printing by tracking all sticker generations in real-time.</p>
      </div>
    </div>
  );

  return (
    <div className="digitalize-container">
      {/* Top Navigation Tabs for Fabric Copy Suite */}
      <div className="fc-top-tabs-container">
        <div className="fabric-copy-nav-tabs">
          <button
            className="fc-nav-tab"
            onClick={() => navigate('/fabric-copy/cutting-copy')}
          >
            <Scissors size={16} />
            <span>Cutting Copy</span>
          </button>
          <button
            className="fc-nav-tab active"
            onClick={() => navigate('/fabric-copy/digitalize-gatta')}
          >
            <Cpu size={16} />
            <span>Digitalize Gatta</span>
          </button>
          <button
            className="fc-nav-tab"
            onClick={() => navigate('/fabric-copy/upload-copy')}
          >
            <UploadCloud size={16} />
            <span>Upload Copy</span>
          </button>
        </div>
      </div>

      {/* Header */}
      <header className="modern-header">
        <div className="header-content">
          <div className="logo-section" onClick={() => navigate('/')}>
            <div className="logo-icon">📦</div>
            <div className="logo-text">
              <h1>Digitalize Gatta</h1>
              <span>Smart Inventory Management</span>
            </div>
          </div>
          <div className="header-actions">
            <button onClick={handleUploadCopyClick} className="btn-outline">
              <span>📸</span> Upload Copy
            </button>
            <button onClick={handleRefresh} className="btn-icon" title="Refresh Data">⟳</button>
            <div className="stats-badge">
              <span className="badge-dot"></span>
              <span>{Object.keys(partyCodeMap).length} Party Codes</span>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="steps-container">
        <div className="steps-wrapper">
          <div className={`step-item ${activeStep >= 1 ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <span className="step-label">Select Date</span>
          </div>
          <div className={`step-connector ${activeStep >= 2 ? 'active' : ''}`}></div>
          <div className={`step-item ${activeStep >= 2 ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <span className="step-label">Choose Bill</span>
          </div>
          <div className={`step-connector ${activeStep >= 3 ? 'active' : ''}`}></div>
          <div className={`step-item ${activeStep >= 3 ? 'active' : ''}`}>
            <div className="step-number">3</div>
            <span className="step-label">Print Stickers</span>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <main className="modern-main">
        <div className="two-column-layout">
          {/* LEFT COLUMN - Theoretical Information */}
          <LeftColumn />

          {/* RIGHT COLUMN - Interactive Tables */}
          <div className="right-column">
            {/* Step 1: Date Selection Table */}
            {activeStep === 1 && (
              <div className="content-card">
                <div className="card-header">
                  <h2>Select Receiving Date</h2>
                  <p>Choose a date to view available bills • {uniqueDates.length} dates available</p>
                </div>
                
                {/* Advanced Filters Toggle */}
                <div className="filter-toggle-section">
                  <button 
                    onClick={() => setShowDateFilters(!showDateFilters)} 
                    className={`filter-toggle-btn ${showDateFilters ? 'active' : ''}`}
                  >
                    <span>🔍</span> Advanced Filters {showDateFilters ? '▲' : '▼'}
                  </button>
                  {(dateFilterMonth || dateFilterYear || dateFilterBillRange.min || dateFilterBillRange.max || dateSearchTerm) && (
                    <button onClick={resetDateFilters} className="reset-filters-btn">
                      Reset All Filters
                    </button>
                  )}
                </div>

                {/* Advanced Filters Panel */}
                {showDateFilters && (
                  <div className="filters-panel">
                    <div className="filters-grid">
                      <div className="filter-group">
                        <label>Month Filter</label>
                        <select 
                          value={dateFilterMonth} 
                          onChange={(e) => setDateFilterMonth(e.target.value)}
                          className="filter-select"
                        >
                          <option value="">All Months</option>
                          {availableMonths.map(month => (
                            <option key={month} value={month}>{month}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="filter-group">
                        <label>Year Filter</label>
                        <select 
                          value={dateFilterYear} 
                          onChange={(e) => setDateFilterYear(e.target.value)}
                          className="filter-select"
                        >
                          <option value="">All Years</option>
                          {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="filter-group range-group">
                        <label>Bill Count Range</label>
                        <div className="range-inputs">
                          <input
                            type="number"
                            placeholder="Min Bills"
                            value={dateFilterBillRange.min}
                            onChange={(e) => setDateFilterBillRange({...dateFilterBillRange, min: e.target.value})}
                            className="filter-input"
                          />
                          <span>to</span>
                          <input
                            type="number"
                            placeholder="Max Bills"
                            value={dateFilterBillRange.max}
                            onChange={(e) => setDateFilterBillRange({...dateFilterBillRange, max: e.target.value})}
                            className="filter-input"
                          />
                        </div>
                      </div>
                      
                      <div className="filter-group">
                        <label>Date Search</label>
                        <div className="search-wrapper">
                          <span className="search-icon">🔍</span>
                          <input
                            type="text"
                            placeholder="Search by date..."
                            value={dateSearchTerm}
                            onChange={(e) => setDateSearchTerm(e.target.value)}
                            className="search-input"
                          />
                          {dateSearchTerm && (
                            <button onClick={() => setDateSearchTerm('')} className="clear-btn">✕</button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="filter-summary">
                      <span>📊 Showing {uniqueDates.length} dates</span>
                      {(dateFilterMonth || dateFilterYear || dateFilterBillRange.min || dateFilterBillRange.max || dateSearchTerm) && (
                        <span className="filter-active-badge">Filters Active</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Simple Search Bar */}
                {!showDateFilters && (
                  <div className="search-section">
                    <div className="search-wrapper">
                      <span className="search-icon">🔍</span>
                      <input
                        type="text"
                        placeholder="Search by date..."
                        value={dateSearchTerm}
                        onChange={(e) => setDateSearchTerm(e.target.value)}
                        className="search-input"
                      />
                      {dateSearchTerm && (
                        <button onClick={() => setDateSearchTerm('')} className="clear-btn">✕</button>
                      )}
                    </div>
                  </div>
                )}

                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th onClick={() => setDateSortConfig({ key: 'date', direction: dateSortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="sortable-header">
                          Date {getSortIcon('date', dateSortConfig)}
                        </th>
                        <th onClick={() => setDateSortConfig({ key: 'billCount', direction: dateSortConfig.key === 'billCount' && dateSortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="sortable-header">
                          Bill Count {getSortIcon('billCount', dateSortConfig)}
                        </th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueDates.map((dateObj) => (
                        <tr key={dateObj.date} className="data-row" onClick={() => handleDateSelect(dateObj.date)}>
                          <td className="date-cell">
                            <div className="date-display">
                              <span className="date-day">{dateObj.day}</span>
                              <div className="date-details">
                                <span className="date-month-year">{dateObj.monthShort} {dateObj.year}</span>
                                <span className="date-full">{dateObj.formattedDate}</span>
                              </div>
                            </div>
                          </td>
                          <td className="bill-count-cell">
                            <span className="bill-count-badge">{dateObj.billCount}</span>
                          </td>
                          <td className="action-cell">
                            <button className="select-btn">Select →</button>
                          </td>
                        </tr>
                      ))}
                      {uniqueDates.length === 0 && (
                        <tr>
                          <td colSpan="3" className="empty-table">
                            <div className="empty-state">
                              <div className="empty-icon">📅</div>
                              <h3>No Dates Available</h3>
                              <p>Try adjusting your filters</p>
                              <button onClick={resetDateFilters} className="btn-outline-small">Reset Filters</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Step 2: Bill Selection Table */}
            {activeStep === 2 && selectedDate && (
              <div className="content-card">
                <div className="card-header">
                  <button onClick={() => setActiveStep(1)} className="back-btn">← Back</button>
                  <div>
                    <h2>Select Bill Number</h2>
                    <p className="date-info">For Date: {formatDate(selectedDate)} • {availableBills.length} bills available</p>
                    {loadingPrintHistory && <span className="loading-badge">Loading print history...</span>}
                  </div>
                </div>

                {/* Advanced Filters Toggle */}
                <div className="filter-toggle-section">
                  <button 
                    onClick={() => setShowBillFilters(!showBillFilters)} 
                    className={`filter-toggle-btn ${showBillFilters ? 'active' : ''}`}
                  >
                    <span>🔍</span> Advanced Filters {showBillFilters ? '▲' : '▼'}
                  </button>
                  {(billFilterMinRolls || billFilterMaxRolls || billFilterMinWeight || billFilterMaxWeight || 
                    billFilterMinCategories || billFilterMaxCategories || billFilterStatus !== 'all' || billSearchTerm) && (
                    <button onClick={resetBillFilters} className="reset-filters-btn">
                      Reset All Filters
                    </button>
                  )}
                </div>

                {/* Advanced Filters Panel */}
                {showBillFilters && (
                  <div className="filters-panel">
                    <div className="filters-grid">
                      <div className="filter-group range-group">
                        <label>Rolls Range</label>
                        <div className="range-inputs">
                          <input
                            type="number"
                            placeholder="Min Rolls"
                            value={billFilterMinRolls}
                            onChange={(e) => setBillFilterMinRolls(e.target.value)}
                            className="filter-input"
                          />
                          <span>to</span>
                          <input
                            type="number"
                            placeholder="Max Rolls"
                            value={billFilterMaxRolls}
                            onChange={(e) => setBillFilterMaxRolls(e.target.value)}
                            className="filter-input"
                          />
                        </div>
                      </div>
                      
                      <div className="filter-group range-group">
                        <label>Weight Range (KG)</label>
                        <div className="range-inputs">
                          <input
                            type="number"
                            step="0.1"
                            placeholder="Min Weight"
                            value={billFilterMinWeight}
                            onChange={(e) => setBillFilterMinWeight(e.target.value)}
                            className="filter-input"
                          />
                          <span>to</span>
                          <input
                            type="number"
                            step="0.1"
                            placeholder="Max Weight"
                            value={billFilterMaxWeight}
                            onChange={(e) => setBillFilterMaxWeight(e.target.value)}
                            className="filter-input"
                          />
                        </div>
                      </div>
                      
                      <div className="filter-group range-group">
                        <label>Categories Range</label>
                        <div className="range-inputs">
                          <input
                            type="number"
                            placeholder="Min Categories"
                            value={billFilterMinCategories}
                            onChange={(e) => setBillFilterMinCategories(e.target.value)}
                            className="filter-input"
                          />
                          <span>to</span>
                          <input
                            type="number"
                            placeholder="Max Categories"
                            value={billFilterMaxCategories}
                            onChange={(e) => setBillFilterMaxCategories(e.target.value)}
                            className="filter-input"
                          />
                        </div>
                      </div>
                      
                      <div className="filter-group">
                        <label>Print Status</label>
                        <select 
                          value={billFilterStatus} 
                          onChange={(e) => setBillFilterStatus(e.target.value)}
                          className="filter-select"
                        >
                          <option value="all">All Bills</option>
                          <option value="available">Available Only</option>
                          <option value="printed">Already Printed</option>
                        </select>
                      </div>
                      
                      <div className="filter-group">
                        <label>Bill Number Search</label>
                        <div className="search-wrapper">
                          <span className="search-icon">🔍</span>
                          <input
                            type="text"
                            placeholder="Search by bill number..."
                            value={billSearchTerm}
                            onChange={(e) => setBillSearchTerm(e.target.value)}
                            className="search-input"
                          />
                          {billSearchTerm && (
                            <button onClick={() => setBillSearchTerm('')} className="clear-btn">✕</button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="filter-summary">
                      <span>📊 Showing {availableBills.length} bills</span>
                      {(billFilterMinRolls || billFilterMaxRolls || billFilterMinWeight || billFilterMaxWeight || 
                        billFilterMinCategories || billFilterMaxCategories || billFilterStatus !== 'all' || billSearchTerm) && (
                        <span className="filter-active-badge">Filters Active</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Simple Search Bar */}
                {!showBillFilters && (
                  <div className="search-section">
                    <div className="search-wrapper">
                      <span className="search-icon">🔍</span>
                      <input
                        type="text"
                        placeholder="Search by bill number..."
                        value={billSearchTerm}
                        onChange={(e) => setBillSearchTerm(e.target.value)}
                        className="search-input"
                      />
                      {billSearchTerm && (
                        <button onClick={() => setBillSearchTerm('')} className="clear-btn">✕</button>
                      )}
                    </div>
                  </div>
                )}

                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th onClick={() => setBillSortConfig({ key: 'billNumber', direction: billSortConfig.key === 'billNumber' && billSortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="sortable-header">
                          Bill Number {getSortIcon('billNumber', billSortConfig)}
                        </th>
                        <th onClick={() => setBillSortConfig({ key: 'categories', direction: billSortConfig.key === 'categories' && billSortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="sortable-header">
                          Categories {getSortIcon('categories', billSortConfig)}
                        </th>
                        <th onClick={() => setBillSortConfig({ key: 'totalRolls', direction: billSortConfig.key === 'totalRolls' && billSortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="sortable-header">
                          Total Rolls {getSortIcon('totalRolls', billSortConfig)}
                        </th>
                        <th onClick={() => setBillSortConfig({ key: 'totalWeight', direction: billSortConfig.key === 'totalWeight' && billSortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="sortable-header">
                          Total Weight (KG) {getSortIcon('totalWeight', billSortConfig)}
                        </th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableBills.map((bill) => (
                        <tr 
                          key={bill.billNumber} 
                          className={`data-row ${bill.isPrinted ? 'disabled-row' : ''}`}
                          onClick={() => !bill.isPrinted && handleBillSelect(bill.billNumber)}
                        >
                          <td className="bill-cell">
                            <span className="bill-number-display">🏷️ {bill.billNumber}</span>
                          </td>
                          <td className="categories-cell">
                            <span className="category-badge">{bill.categories}</span>
                          </td>
                          <td className="rolls-cell">{bill.totalRolls}</td>
                          <td className="weight-cell">{bill.totalWeight}</td>
                          <td className="status-cell">
                            {bill.isPrinted ? (
                              <span className="status-badge printed">✓ Already Printed</span>
                            ) : (
                              <span className="status-badge available">Available</span>
                            )}
                          </td>
                          <td className="action-cell">
                            {!bill.isPrinted ? (
                              <button className="select-btn">Select →</button>
                            ) : (
                              <button className="disabled-btn" disabled>Not Available</button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {availableBills.length === 0 && (
                        <tr>
                          <td colSpan="6" className="empty-table">
                            <div className="empty-state">
                              <div className="empty-icon">🚚</div>
                              <h3>No Bills Found</h3>
                              <p>Try adjusting your filters</p>
                              <button onClick={resetBillFilters} className="btn-outline-small">Reset Filters</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Step 3: Sticker Preview & Settings */}
            {activeStep === 3 && showStickerPreview && selectedBillSummary && (
              <div className="content-card">
                <div className="card-header">
                  <button onClick={() => setActiveStep(2)} className="back-btn">← Back</button>
                  <div>
                    <h2>Sticker Configuration</h2>
                    <p>Customize and generate your stickers • Select categories to print</p>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="summary-table-wrapper">
                  <table className="summary-table">
                    <tbody>
                      <tr>
                        <td className="summary-label">Bill Number</td>
                        <td className="summary-value">{selectedBillSummary.billNumber}</td>
                        <td className="summary-label">Categories</td>
                        <td className="summary-value">{selectedBillSummary.categories}</td>
                      </tr>
                      <tr>
                        <td className="summary-label">Total Rolls</td>
                        <td className="summary-value">{selectedBillSummary.totalRolls}</td>
                        <td className="summary-label">Total Weight</td>
                        <td className="summary-value">{selectedBillSummary.totalWeight} KG</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Settings Section */}
                <div className="settings-section">
                  <h3>⚙️ Sticker Settings</h3>
                  <div className="settings-table-wrapper">
                    <table className="settings-table">
                      <tbody>
                        <tr>
                          <td className="settings-label">
                            <label>
                              <input type="checkbox" checked={useManualLocation} onChange={(e) => setUseManualLocation(e.target.checked)} />
                              <span>📍 Manual Location Override</span>
                            </label>
                          </td>
                          <td>
                            {useManualLocation && (
                              <input
                                type="text"
                                value={manualLocation}
                                onChange={(e) => setManualLocation(e.target.value)}
                                placeholder="Enter location (e.g., RACK-03, SHELF-B)"
                                className="form-input"
                              />
                            )}
                            {!useManualLocation && (
                              <span className="info-hint">Auto-detects store location from data</span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="settings-label">👤 Received By</td>
                          <td>
                            <input
                              type="text"
                              value={receivedPerson}
                              onChange={(e) => setReceivedPerson(e.target.value)}
                              placeholder="Enter receiver name"
                              className="form-input"
                            />
                            <span className="info-hint">Person who received the goods</span>
                          </td>
                        </tr>
                        <tr>
                          <td className="settings-label">✍️ Authorized By</td>
                          <td>
                            <input
                              type="text"
                              value={authorizedPerson}
                              onChange={(e) => setAuthorizedPerson(e.target.value)}
                              placeholder="Enter authorizer name"
                              className="form-input"
                            />
                            <span className="info-hint">Person authorizing this print</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Categories Selection Table */}
                <div className="categories-section">
                  <div className="categories-header">
                    <h3>Select Categories to Print</h3>
                    <button onClick={handleSelectAll} className="action-link">
                      {selectAll ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  
                  <div className="table-wrapper">
                    <table className="categories-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>
                            <input
                              type="checkbox"
                              checked={selectAll}
                              onChange={handleSelectAll}
                              className="checkbox-select"
                            />
                          </th>
                          <th>Fabric</th>
                          <th>Shade</th>
                          <th>Party Code</th>
                          <th>Location</th>
                          <th>Lot Numbers</th>
                          <th>Rolls</th>
                          <th>Weight (KG)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stickerGroups.map((group, index) => (
                          <tr 
                            key={index}
                            className={selectedCategories.includes(index) ? 'selected-row' : ''}
                            onClick={() => {
                              if (selectedCategories.includes(index)) {
                                setSelectedCategories(selectedCategories.filter(i => i !== index));
                                setSelectAll(false);
                              } else {
                                setSelectedCategories([...selectedCategories, index]);
                                if (selectedCategories.length + 1 === stickerGroups.length) {
                                  setSelectAll(true);
                                }
                              }
                            }}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedCategories.includes(index)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (e.target.checked) {
                                    setSelectedCategories([...selectedCategories, index]);
                                    if (selectedCategories.length + 1 === stickerGroups.length) {
                                      setSelectAll(true);
                                    }
                                  } else {
                                    setSelectedCategories(selectedCategories.filter(i => i !== index));
                                    setSelectAll(false);
                                  }
                                }}
                                className="checkbox-select"
                              />
                            </td>
                            <td className="fabric-cell">{group.fabric}</td>
                            <td className="shade-cell">{group.shade}</td>
                            <td className="party-cell">{group.codedParty}</td>
                            <td className="location-cell">{group.storeLocation}</td>
                            <td className="lot-cell">{group.lotNumbers || 'N/A'}</td>
                            <td className="rolls-cell">{Math.round(group.totalRolls)}</td>
                            <td className="weight-cell">{group.totalWeight.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="summary-row">
                          <td colSpan="6" className="summary-label">Selected Summary:</td>
                          <td className="summary-value">
                            {selectedCategories.reduce((sum, idx) => sum + Math.round(stickerGroups[idx]?.totalRolls || 0), 0)} Rolls
                          </td>
                          <td className="summary-value">
                            {selectedCategories.reduce((sum, idx) => sum + (stickerGroups[idx]?.totalWeight || 0), 0).toFixed(1)} KG
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="action-buttons">
                  <button onClick={() => setActiveStep(2)} className="btn-secondary">
                    ← Change Bill
                  </button>
                  <button 
                    onClick={handlePrintStickers} 
                    disabled={selectedCategories.length === 0 || isSavingToSheet} 
                    className="btn-primary"
                  >
                    {isSavingToSheet ? '💾 Saving...' : '🖨️ Print Stickers'}
                    {!isSavingToSheet && selectedCategories.length > 0 && ` (${selectedCategories.length})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="modern-footer">
        <div className="footer-content">
          <div className="live-status">
            <span className="live-dot"></span>
            <span>Live Data</span>
          </div>
          <span className="footer-separator">•</span>
          <span>Last Updated: {lastUpdated || '--:--'}</span>
          <span className="footer-separator">•</span>
          <span>{allData.length.toLocaleString()} Records</span>
          <span className="footer-separator">•</span>
          <span>✅ {printedBills.size} Bills Printed</span>
          <span className="footer-separator">•</span>
          <span>🏷️ Sticker Size: {STICKER_WIDTH_MM}×{STICKER_HEIGHT_MM}mm</span>
        </div>
      </footer>

      {/* Top Tabs Custom Styling */}
      <style>{`
        .fc-top-tabs-container {
          padding: 16px 32px 0 32px;
          background: #f8fafc;
        }

        .dark .fc-top-tabs-container {
          background: #0f172a;
        }

        .fc-top-tabs-container .fabric-copy-nav-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f1f5f9;
          padding: 6px;
          border-radius: 14px;
          margin-bottom: 0px;
          border: 1px solid #e2e8f0;
          overflow-x: auto;
          max-width: 2200px;
          margin: 0 auto;
        }

        .dark .fc-top-tabs-container .fabric-copy-nav-tabs {
          background: #1e293b;
          border-color: #334155;
        }

        .fc-nav-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 18px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .fc-nav-tab:hover {
          color: #1e293b;
          background: rgba(255, 255, 255, 0.6);
        }

        .dark .fc-nav-tab:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.1);
        }

        .fc-nav-tab.active {
          background: white;
          color: #2563eb;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .dark .fc-nav-tab.active {
          background: #0f172a;
          color: #60a5fa;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }
      `}</style>
    </div>
  );
}

export default DigitalizeGatta;

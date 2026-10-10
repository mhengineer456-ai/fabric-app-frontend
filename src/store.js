export const BASE_URL = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl;
  return 'https://fabric-app-backend-production.up.railway.app/api';
})();



const getHeaders = () => {
  const token = localStorage.getItem('twms_token');
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const handleResponse = async (response) => {
  if (!response.ok) {
    if (response.status === 401 && localStorage.getItem('twms_token')) {
      localStorage.removeItem('twms_token');
      localStorage.removeItem('twms_user');
      window.location.href = '/login';
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `HTTP error! Status: ${response.status}`);
  }
  return response.json();
};

export const store = {
  // --- AUTHENTICATION ---
  login: async (email, password) => {
    const data = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handleResponse);

    if (data.token && data.user) {
      localStorage.setItem('twms_token', data.token);
      localStorage.setItem('twms_user', JSON.stringify(data.user));
    }
    return data;
  },

  register: async (userData) => {
    return fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    }).then(handleResponse);
  },

  verifyRegisterOtp: async (email, otp) => {
    return fetch(`${BASE_URL}/auth/verify-register-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    }).then(handleResponse);
  },

  verifyLoginOtp: async (email, otp) => {
    const data = await fetch(`${BASE_URL}/auth/verify-login-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    }).then(handleResponse);

    if (data.token && data.user) {
      localStorage.setItem('twms_token', data.token);
      localStorage.setItem('twms_user', JSON.stringify(data.user));
    }
    return data;
  },

  resendOtp: async (email, action) => {
    return fetch(`${BASE_URL}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action }),
    }).then(handleResponse);
  },

  forgotPassword: async (email) => {
    return fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then(handleResponse);
  },

  resetPassword: async (email, otp, newPassword) => {
    return fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, newPassword }),
    }).then(handleResponse);
  },

  fetchDyeingLotDetails: async (lotNumber) => {
    return fetch(`${BASE_URL}/google-sheets/fetch-dyeing-lot-details?lotNumber=${lotNumber}`, {
      headers: getHeaders(),
    }).then(handleResponse);
  },

  // --- MATERIALS ---
  getMaterials: async (filters = {}) => {
    const params = new URLSearchParams();
    const { signal, ...rest } = filters;
    Object.entries(rest).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        params.append(key, val);
      }
    });

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return fetch(`${BASE_URL}/materials${queryString}`, {
      headers: getHeaders(),
      signal
    }).then(handleResponse);
  },

  getInventory: async (page = 1, limit = 50, search = '', party = '', shade = '', storeName = '', stockStatus = 'All', balPkgs = '', description = '') => {
    return fetch(`${BASE_URL}/inventory?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&party=${encodeURIComponent(party)}&shade=${encodeURIComponent(shade)}&store=${encodeURIComponent(storeName)}&stockStatus=${encodeURIComponent(stockStatus)}&balPkgs=${encodeURIComponent(balPkgs)}&description=${encodeURIComponent(description)}`, {
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getInventoryFilterValues: async () => {
    return fetch(`${BASE_URL}/inventory/filter-values`, {
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getAllIssuedBarcodes: async () => {
    return fetch(`${BASE_URL}/all-issued-barcodes`, {
      headers: getHeaders(),
    }).then(handleResponse);
  },

  addMaterial: async (materialData) => {
    return fetch(`${BASE_URL}/materials`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(materialData),
    }).then(handleResponse);
  },

  updateMaterial: async (id, materialData) => {
    return fetch(`${BASE_URL}/materials/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(materialData),
    }).then(handleResponse);
  },

  deleteMaterial: async (id) => {
    return fetch(`${BASE_URL}/materials/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  // --- GRN (GOODS RECEIVING) ---
  getGRNs: async () => {
    return fetch(`${BASE_URL}/grns`, {
      headers: getHeaders(),
    }).then(handleResponse);
  },

  addGRN: async (grnData) => {
    return fetch(`${BASE_URL}/grns`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(grnData),
    }).then(handleResponse);
  },

  // --- ISSUES (DISPATCH) ---
  getIssues: async () => {
    return fetch(`${BASE_URL}/issues`, {
      headers: getHeaders(),
    }).then(handleResponse);
  },

  addIssue: async (issueData) => {
    return fetch(`${BASE_URL}/issues`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(issueData),
    }).then(handleResponse);
  },

  // --- TRANSFERS ---
  getTransfers: async () => {
    return fetch(`${BASE_URL}/transfers`, {
      headers: getHeaders(),
    }).then(handleResponse);
  },

  addTransfer: async (transferData) => {
    return fetch(`${BASE_URL}/transfers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(transferData),
    }).then(handleResponse);
  },

  approveTransfer: async (id) => {
    return fetch(`${BASE_URL}/transfers/${id}/approve`, {
      method: 'POST',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  rejectTransfer: async (id) => {
    return fetch(`${BASE_URL}/transfers/${id}/reject`, {
      method: 'POST',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  // --- SETTINGS (ROOMS, RACKS, SHELVES, SUPPLIERS) ---
  getSettingsData: async () => {
    return fetch(`${BASE_URL}/settings`, {
      headers: getHeaders(),
    }).then(handleResponse);
  },

  _settingsPromise: null,
  getSettings: function() {
    if (!this._settingsPromise) {
      this._settingsPromise = fetch(`${BASE_URL}/settings`, {
        headers: getHeaders(),
      })
        .then(handleResponse)
        .finally(() => {
          setTimeout(() => {
            this._settingsPromise = null;
          }, 3000);
        });
    }
    return this._settingsPromise;
  },

  getRooms: function() {
    return this.getSettings().then(data => data.rooms || []);
  },

  getFloors: function() {
    return this.getSettings().then(data => data.floors || []);
  },

  getRacks: function() {
    return this.getSettings().then(data => data.racks || []);
  },

  getShelves: function() {
    return this.getSettings().then(data => data.shelves || []);
  },

  getSuppliers: function() {
    return this.getSettings().then(data => data.suppliers || []);
  },

  getAuditLog: function() {
    return this.getSettings().then(data => data.auditLog || []);
  },

  addRoom: async (roomData) => {
    return fetch(`${BASE_URL}/rooms`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(roomData),
    }).then(handleResponse);
  },

  updateRoom: async (id, roomData) => {
    return fetch(`${BASE_URL}/rooms/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(roomData),
    }).then(handleResponse);
  },

  deleteRoom: async (id) => {
    return fetch(`${BASE_URL}/rooms/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getRacksByRoom: async (roomCode) => {
    return fetch(`${BASE_URL}/settings`, {
      headers: getHeaders(),
    }).then(handleResponse).then(data => (data.racks || []).filter(r => r.room === roomCode));
  },

  addRack: async (rackData) => {
    return fetch(`${BASE_URL}/racks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(rackData),
    }).then(handleResponse);
  },

  deleteRack: async (id) => {
    return fetch(`${BASE_URL}/racks/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getShelvesForRack: async (rackCode) => {
    return fetch(`${BASE_URL}/settings`, {
      headers: getHeaders(),
    }).then(handleResponse).then(data => (data.shelves || []).filter(s => s.rack === rackCode));
  },

  addShelf: async (shelfData) => {
    return fetch(`${BASE_URL}/shelves`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(shelfData),
    }).then(handleResponse);
  },

  deleteShelf: async (id) => {
    return fetch(`${BASE_URL}/shelves/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  addSupplier: async (supplierData) => {
    return fetch(`${BASE_URL}/suppliers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(supplierData),
    }).then(handleResponse);
  },

  updateSupplier: async (id, supplierData) => {
    return fetch(`${BASE_URL}/suppliers/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(supplierData),
    }).then(handleResponse);
  },

  deleteSupplier: async (id) => {
    return fetch(`${BASE_URL}/suppliers/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  // --- FLOORS MANAGEMENT (MOCKED TO ROOMS UPDATE SINCE FLOORS DO NOT HAVE A DEDICATED MODEL TABLE) ---
  addFloor: async (floorName) => {
    // Return mock success as floor list is derived from rooms dynamically
    return { success: true, name: floorName };
  },

  deleteFloor: async (floorName) => {
    return { success: true, name: floorName };
  },

  renameFloor: async (oldName, newName) => {
    return { success: true, oldName, newName };
  },

  // --- OCR BILL PARSER ---
  parseBillOcr: async (fileObject) => {
    const formData = new FormData();
    formData.append('bill', fileObject);

    const token = localStorage.getItem('twms_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}/ocr/parse-bill`, {
      method: 'POST',
      headers: headers,
      body: formData,
    });

    return handleResponse(response);
  },

  // --- GOOGLE SHEETS DYEING LOT FETCH ---
  fetchDyeingLotDetails: async (lotNo) => {
    const response = await fetch(`${BASE_URL}/google-sheets/fetch-by-lot/${encodeURIComponent(lotNo)}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  fetchPendingStockByLot: async (lotNo) => {
    const response = await fetch(`${BASE_URL}/google-sheets/pending-stock-by-lot/${encodeURIComponent(lotNo)}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // --- DIRECT GOOGLE SHEETS API (FabricStock Sheet) ---
  fetchFabricStockDirect: async (lotNo) => {
    const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY || 'AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk';
    const SPREADSHEET_ID = import.meta.env.VITE_GOOGLE_SPREADSHEET_ID || '1SKGM8tsZ6nCJbCsY9M-eUKaS-ohSLM3Vi8bRKD4w0IA';
    const cleanLot = String(lotNo || '').trim();
    if (!cleanLot) return { success: true, data: [] };

    const parseSheetDateStr = (dateStr) => {
      if (!dateStr) return '';
      const raw = String(dateStr).trim();
      if (!raw) return '';

      // If already in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

      const normalized = raw.replace(/\//g, '-').replace(/\s+/g, '-');
      const parts = normalized.split('-');
      if (parts.length === 3) {
        let p0 = parseInt(parts[0], 10);
        let p1 = parts[1].toLowerCase();
        let p2 = parseInt(parts[2], 10);

        const months = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        let month = null;

        // Check if middle part is named month (e.g. Nov, Apr)
        for (const [k, v] of Object.entries(months)) {
          if (p1.startsWith(k)) {
            month = v;
            break;
          }
        }

        // If not named month, check if numeric month
        if (!month && !isNaN(parseInt(p1, 10))) {
          const numM = parseInt(p1, 10);
          if (numM >= 1 && numM <= 12) {
            month = String(numM).padStart(2, '0');
          }
        }

        // Handle day and year
        let day = p0;
        let year = p2;

        // In case format is YYYY-MM-DD
        if (p0 > 1000) {
          year = p0;
          day = p2;
        }

        if (month && !isNaN(day) && !isNaN(year)) {
          if (year < 100) year = 2000 + year;
          return `${year}-${month}-${String(day).padStart(2, '0')}`;
        }
      }
      return raw;
    };

    const normalizeLot = (str) => String(str || '').trim().toLowerCase().replace(/[\s\-_/]/g, '');
    const targetNorm = normalizeLot(cleanLot);

    // 1. Try Direct Google Sheets v4 API
    try {
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('FabricStock!A1:Z')}?key=${API_KEY}`;
      const res = await fetch(sheetsUrl);
      if (res.ok) {
        const json = await res.json();
        const rows = json.values || [];
        if (rows.length > 0) {
          // Detect header row (usually row 4 / index 3)
          let headerIdx = -1;
          for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const rStr = rows[i].map(c => String(c).toLowerCase()).join(' ');
            if (rStr.includes('lot no') || rStr.includes('item name') || (rStr.includes('issue no') && rStr.includes('party'))) {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx === -1) headerIdx = 3;

          const matches = [];
          for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const rowLot = String(row[4] || '').trim(); // Column E: Lot No
            if (!rowLot) continue;

            const rowNorm = normalizeLot(rowLot);
            if (rowNorm === targetNorm || rowNorm.includes(targetNorm) || targetNorm.includes(rowNorm)) {
              const billNo = String(row[0] || '').trim(); // Column A: Issue No.
              const dateVal = parseSheetDateStr(row[1]); // Column B: IssueTrDate
              const party = String(row[2] || '').trim(); // Column C: Party
              const srNo = String(row[3] || '').trim(); // Column D: SrNo
              const itemName = String(row[5] || '').trim(); // Column F: Item Name

              let joNo = String(row[6] || '').trim(); // Column G: JO No / Job Order
              let rawUnit = String(row[7] || '').trim(); // Column H: Unit
              let rawShade = String(row[8] || '').trim(); // Column I: Shade

              // Handle JO in unit column
              if (rawUnit.toUpperCase().startsWith('JO') || rawUnit.toUpperCase().includes('JOB')) {
                if (!joNo) joNo = rawUnit;
                rawUnit = 'KGS';
              }

              // Normalize unit to standard KGs/Pcs/Mtrs
              let unitVal = 'KGs';
              if (rawUnit.toUpperCase().includes('PCS') || rawUnit.toUpperCase().includes('PC')) {
                unitVal = 'Pcs';
              } else if (rawUnit.toUpperCase().includes('MTR')) {
                unitVal = 'Mtrs';
              } else {
                unitVal = 'KGs';
              }

              // Clean shade
              let shadeVal = rawShade;
              if (['KGS', 'PCS', 'MTR', 'MTRS', 'KG'].includes(shadeVal.toUpperCase())) {
                shadeVal = '';
              }

              const rolls = parseInt(String(row[9] || '1').replace(/,/g, '')) || 1; // Column J (labeled Quantity): Number of Rolls
              const issuedWeight = parseFloat(String(row[10] || '0').replace(/,/g, '')) || 0.00; // Column K (labeled Process): Issued Weight / Quantity
              const processVal = String(row[11] || 'DYEING').trim(); // Column L (labeled IssueRemarks): Process

              matches.push({
                rowId: i,
                lotNumber: rowLot,
                party: party,
                cmfParty: party,
                fabricName: itemName,
                billNumber: billNo,
                issueNo: billNo,
                issueDate: dateVal,
                srNo: srNo,
                jobOrderNo: joNo,
                unit: unitVal,
                shade: shadeVal,
                rolls: rolls,
                issueRolls: rolls,
                totalRolls: rolls,
                quantity: issuedWeight,
                issueQty: issuedWeight,
                billedQty: issuedWeight,
                weight: issuedWeight,
                opQty: issuedWeight,
                balance: issuedWeight,
                process: processVal,
                remarks: `FabricStock Entry Row #${i + 1}`
              });
            }
          }

          if (matches.length > 0) {
            return {
              success: true,
              source: 'google-sheets-api-v4',
              lotNumber: cleanLot,
              count: matches.length,
              data: matches
            };
          }
        }
      }
    } catch (apiErr) {
      console.warn('[Direct Sheets API] Error fetching from Google Sheets v4 API:', apiErr);
    }

    // 2. Fallback to direct CSV export from Google Sheets (gid=22117471 for FabricStock)
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=22117471`;
      const csvRes = await fetch(csvUrl);
      if (csvRes.ok) {
        const text = await csvRes.text();
        const lines = text.split(/\r?\n/).map(l => {
          const cells = [];
          let cur = '';
          let inQuote = false;
          for (let c = 0; c < l.length; c++) {
            const ch = l[c];
            if (ch === '"') {
              inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
              cells.push(cur.trim());
              cur = '';
            } else {
              cur += ch;
            }
          }
          cells.push(cur.trim());
          return cells;
        });

        if (lines.length > 4) {
          const matches = [];
          for (let i = 4; i < lines.length; i++) {
            const row = lines[i];
            if (!row || row.length < 5) continue;
            const rowLot = String(row[4] || '').trim();
            if (!rowLot) continue;
            const rowNorm = normalizeLot(rowLot);
            if (rowNorm === targetNorm || rowNorm.includes(targetNorm) || targetNorm.includes(rowNorm)) {
              const billNo = String(row[0] || '').trim();
              const dateVal = parseSheetDateStr(row[1]);
              const party = String(row[2] || '').trim();
              const srNo = String(row[3] || '').trim();
              const itemName = String(row[5] || '').trim();

              let joNo = String(row[6] || '').trim();
              let rawUnit = String(row[7] || '').trim();
              let rawShade = String(row[8] || '').trim();

              if (rawUnit.toUpperCase().startsWith('JO') || rawUnit.toUpperCase().includes('JOB')) {
                if (!joNo) joNo = rawUnit;
                rawUnit = 'KGS';
              }

              let unitVal = 'KGs';
              if (rawUnit.toUpperCase().includes('PCS') || rawUnit.toUpperCase().includes('PC')) {
                unitVal = 'Pcs';
              } else if (rawUnit.toUpperCase().includes('MTR')) {
                unitVal = 'Mtrs';
              } else {
                unitVal = 'KGs';
              }

              let shadeVal = rawShade;
              if (['KGS', 'PCS', 'MTR', 'MTRS', 'KG'].includes(shadeVal.toUpperCase())) {
                shadeVal = '';
              }

              const rolls = parseInt(String(row[9] || '1').replace(/,/g, '').replace(/"/g, '')) || 1;
              const issuedWeight = parseFloat(String(row[10] || '0').replace(/,/g, '').replace(/"/g, '')) || 0.00;
              const processVal = String(row[11] || 'DYEING').trim();

              matches.push({
                rowId: i,
                lotNumber: rowLot,
                party: party,
                cmfParty: party,
                fabricName: itemName,
                billNumber: billNo,
                issueNo: billNo,
                issueDate: dateVal,
                srNo: srNo,
                jobOrderNo: joNo,
                unit: unitVal,
                shade: shadeVal,
                rolls: rolls,
                issueRolls: rolls,
                totalRolls: rolls,
                quantity: issuedWeight,
                issueQty: issuedWeight,
                billedQty: issuedWeight,
                weight: issuedWeight,
                opQty: issuedWeight,
                balance: issuedWeight,
                process: processVal,
                remarks: `CSV Export Entry Row #${i + 1}`
              });
            }
          }

          if (matches.length > 0) {
            return {
              success: true,
              source: 'google-sheets-csv-export',
              lotNumber: cleanLot,
              count: matches.length,
              data: matches
            };
          }
        }
      }
    } catch (csvErr) {
      console.warn('[Direct Sheets CSV] Error fetching CSV export fallback:', csvErr);
    }

    // 3. Fallback to backend API
    return store.fetchPendingStockByLot(cleanLot);
  },

  fetchDyeingRecdWeightByLot: async (lotNo) => {
    const response = await fetch(`${BASE_URL}/dyeing-materials/recd-weight-by-lot/${encodeURIComponent(lotNo)}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getNextBarcodeId: async () => {
    const response = await fetch(`${BASE_URL}/google-sheets/next-barcode-id?t=${Date.now()}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  storeDyeingData: async (payload) => {
    const response = await fetch(`${BASE_URL}/google-sheets/store-dyeing-data`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getRecentDyeingMaterials: async (lotNumber = '', limit = 60) => {
    const qs = new URLSearchParams();
    if (lotNumber) qs.append('lotNumber', lotNumber);
    if (limit) qs.append('limit', limit);
    const response = await fetch(`${BASE_URL}/dyeing-materials/recent?${qs.toString()}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  deleteDyeingMaterial: async (id) => {
    const response = await fetch(`${BASE_URL}/dyeing-materials/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // --- SHORTAGE REPORTS API ---
  createShortageReport: async (reportData) => {
    const response = await fetch(`${BASE_URL}/shortage-reports`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(reportData)
    });
    return handleResponse(response);
  },

  getShortageReports: async (queryParams = {}) => {
    const qs = new URLSearchParams(queryParams).toString();
    const response = await fetch(`${BASE_URL}/shortage-reports${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: getHeaders()
    });
    return handleResponse(response);
  },

  getShortageReportById: async (id) => {
    const response = await fetch(`${BASE_URL}/shortage-reports/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: getHeaders()
    });
    return handleResponse(response);
  },

  updateShortageInspection: async (id, inspectionData) => {
    const response = await fetch(`${BASE_URL}/shortage-reports/${encodeURIComponent(id)}/inspection`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(inspectionData)
    });
    return handleResponse(response);
  },

  deleteShortageReport: async (id) => {
    const response = await fetch(`${BASE_URL}/shortage-reports/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse(response);
  },

  getJobOrders: async () => {
    return fetch(`${BASE_URL}/google-sheets/job-orders`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getIssuedLots: async () => {
    return fetch(`${BASE_URL}/google-sheets/issued-lots`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getPendingCuttingLots: async (refresh = false) => {
    return fetch(`${BASE_URL}/google-sheets/pending-cutting?refresh=${refresh}`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getTableWiseClassification: async () => {
    return fetch(`${BASE_URL}/reports/table-wise-classification`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getDailyCuttingCompletedReport: async (refresh = false, date = '') => {
    return fetch(`${BASE_URL}/reports/daily-cutting-completed?refresh=${refresh}&date=${encodeURIComponent(date)}`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getDailyInventoryReport: async (date = '') => {
    return fetch(`${BASE_URL}/reports/daily-inventory-quantity?date=${encodeURIComponent(date)}`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getSupervisorIssuanceReport: async (startDate = '', endDate = '') => {
    return fetch(`${BASE_URL}/reports/supervisor-issuance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getDailyFabricIssuanceReport: async (startDate = '', endDate = '', table = '', fabric = '') => {
    return fetch(`${BASE_URL}/reports/daily-fabric-issuance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&table=${encodeURIComponent(table)}&fabric=${encodeURIComponent(fabric)}`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getLocationIssuanceReport: async (startDate = '', endDate = '') => {
    return fetch(`${BASE_URL}/reports/location-issuance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getCutterMasterIssuanceReport: async (startDate = '', endDate = '') => {
    return fetch(`${BASE_URL}/reports/cutter-master-issuance?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getTables: async () => {
    return fetch(`${BASE_URL}/tables`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  addTable: async (data) => {
    return fetch(`${BASE_URL}/tables`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  updateTable: async (id, data) => {
    return fetch(`${BASE_URL}/tables/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  deleteTable: async (id) => {
    return fetch(`${BASE_URL}/tables/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getUsers: async () => {
    return fetch(`${BASE_URL}/auth/users`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  createQuickUser: async (userData) => {
    return fetch(`${BASE_URL}/auth/users`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    }).then(handleResponse);
  },

  getDyeingShortageReport: async () => {
    return fetch(`${BASE_URL}/reports/dyeing-shortage`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  getDyeingShortageReportFromSheet: async () => {
    return fetch(`${BASE_URL}/reports/dyeing-shortage-sheet`, {
      method: 'GET',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  saveAttendance: async (data) => {
    return fetch(`${BASE_URL}/attendance`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }).then(handleResponse);
  },

  getAttendance: async (date = '') => {
    return fetch(`${BASE_URL}/attendance?date=${encodeURIComponent(date)}`, {
      method: 'GET',
      headers: getHeaders()
    }).then(handleResponse);
  },

  deleteAttendance: async (id) => {
    return fetch(`${BASE_URL}/attendance/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse);
  },

  getStaff: async () => {
    return fetch(`${BASE_URL}/staff`, {
      method: 'GET',
      headers: getHeaders()
    }).then(handleResponse);
  },

  addStaff: async (data) => {
    return fetch(`${BASE_URL}/staff`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    }).then(handleResponse);
  },

  deleteStaff: async (id) => {
    return fetch(`${BASE_URL}/staff/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse);
  },

  // --- SPECIAL ISSUANCE APPROVAL REQUESTS ---
  createApprovalRequest: async (payload) => {
    try {
      const res = await fetch(`${BASE_URL}/approval-requests`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      }).then(handleResponse);
      if (res && res.data) {
        // Also sync local backup
        const localList = JSON.parse(localStorage.getItem('twms_approval_requests') || '[]');
        localStorage.setItem('twms_approval_requests', JSON.stringify([res.data, ...localList]));
        return res;
      }
    } catch (e) {
      console.warn('Backend offline, creating approval request locally:', e);
    }
    // Local fallback
    const localReq = {
      id: Date.now(),
      lotNumber: payload.lotNumber,
      tableNo: payload.tableNo,
      requestedBy: payload.requestedBy,
      reason: payload.reason || 'Special Issuance Eligibility Override',
      requestedWeight: payload.requestedWeight || 0,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
    const localList = JSON.parse(localStorage.getItem('twms_approval_requests') || '[]');
    localStorage.setItem('twms_approval_requests', JSON.stringify([localReq, ...localList]));
    return { success: true, data: localReq };
  },

  getApprovalRequests: async () => {
    try {
      const res = await fetch(`${BASE_URL}/approval-requests`, {
        method: 'GET',
        headers: getHeaders()
      }).then(handleResponse);
      if (res && res.data) {
        localStorage.setItem('twms_approval_requests', JSON.stringify(res.data));
        return res.data;
      }
    } catch (e) {
      console.warn('Backend offline, fetching approval requests locally:', e);
    }
    return JSON.parse(localStorage.getItem('twms_approval_requests') || '[]');
  },

  respondApprovalRequest: async (id, status, respondedBy) => {
    try {
      const res = await fetch(`${BASE_URL}/approval-requests/${id}/respond`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status, respondedBy })
      }).then(handleResponse);
      if (res && res.data) {
        const targetTable = res.data.tableNo ? res.data.tableNo.trim().toLowerCase() : '';
        const localList = JSON.parse(localStorage.getItem('twms_approval_requests') || '[]');
        const updated = localList.map(item => {
          const isTarget = String(item.id) === String(id);
          const isSameTable = targetTable && item.tableNo && item.tableNo.trim().toLowerCase() === targetTable;
          if (isTarget || isSameTable) {
            return { ...item, status, respondedBy, respondedAt: new Date().toISOString() };
          }
          return item;
        });
        localStorage.setItem('twms_approval_requests', JSON.stringify(updated));
        return res;
      }
    } catch (e) {
      console.warn('Backend offline, responding approval request locally:', e);
    }
    const localList = JSON.parse(localStorage.getItem('twms_approval_requests') || '[]');
    const targetItem = localList.find(item => String(item.id) === String(id));
    const targetTable = targetItem?.tableNo ? targetItem.tableNo.trim().toLowerCase() : '';
    const updated = localList.map(item => {
      const isTarget = String(item.id) === String(id);
      const isSameTable = targetTable && item.tableNo && item.tableNo.trim().toLowerCase() === targetTable;
      if (isTarget || isSameTable) {
        return { ...item, status, respondedBy, respondedAt: new Date().toISOString() };
      }
      return item;
    });
    localStorage.setItem('twms_approval_requests', JSON.stringify(updated));
    return { success: true, data: updated.find(item => String(item.id) === String(id)) };
  },

  checkApprovalStatus: async (id) => {
    try {
      const res = await fetch(`${BASE_URL}/approval-requests/status/${id}`, {
        method: 'GET',
        headers: getHeaders()
      }).then(handleResponse);
      if (res && res.data) return res.data;
    } catch (e) {
      console.warn('Backend status check fallback to local:', e);
    }
    const localList = JSON.parse(localStorage.getItem('twms_approval_requests') || '[]');
    return localList.find(item => String(item.id) === String(id)) || null;
  },

  consumeApprovalRequest: async (idOrData) => {
    try {
      let url = `${BASE_URL}/approval-requests/consume`;
      let body = {};
      if (typeof idOrData === 'number' || typeof idOrData === 'string') {
        url = `${BASE_URL}/approval-requests/${idOrData}/consume`;
      } else if (idOrData && typeof idOrData === 'object') {
        body = idOrData;
      }
      const res = await fetch(url, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(body)
      }).then(handleResponse);

      const localList = JSON.parse(localStorage.getItem('twms_approval_requests') || '[]');
      const updated = localList.map(item => {
        const matchId = (typeof idOrData !== 'object') && String(item.id) === String(idOrData);
        const matchTable = idOrData?.tableNo && item.tableNo && item.tableNo.trim().toLowerCase() === idOrData.tableNo.trim().toLowerCase();
        if ((matchId || matchTable) && item.status === 'Approved') {
          return { ...item, status: 'Used' };
        }
        return item;
      });
      localStorage.setItem('twms_approval_requests', JSON.stringify(updated));
      return res;
    } catch (e) {
      console.warn('Backend offline, consuming approval request locally:', e);
      const localList = JSON.parse(localStorage.getItem('twms_approval_requests') || '[]');
      const updated = localList.map(item => {
        const matchId = (typeof idOrData !== 'object') && String(item.id) === String(idOrData);
        const matchTable = idOrData?.tableNo && item.tableNo && item.tableNo.trim().toLowerCase() === idOrData.tableNo.trim().toLowerCase();
        if ((matchId || matchTable) && item.status === 'Approved') {
          return { ...item, status: 'Used' };
        }
        return item;
      });
      localStorage.setItem('twms_approval_requests', JSON.stringify(updated));
      return { success: true };
    }
  },

  // --- MASTER REGISTRY (Party, Fabric Name, Shade, Person, Category, Location) ---
  getMasterItems: async (type = 'all', search = '', status = 'all') => {
    try {
      const params = new URLSearchParams();
      if (type && type !== 'all') params.append('type', type);
      if (search) params.append('search', search);
      if (status && status !== 'all') params.append('status', status);

      const res = await fetch(`${BASE_URL}/masters?${params.toString()}`, {
        method: 'GET',
        headers: getHeaders()
      }).then(handleResponse);

      if (res && res.data) {
        // Cache masters by type in local storage for fast autocomplete/offline
        if (type && type !== 'all') {
          localStorage.setItem(`twms_masters_${type}`, JSON.stringify(res.data));
        }
        return res.data;
      }
    } catch (e) {
      console.warn('Backend offline or error, falling back to local master cache:', e);
      if (type && type !== 'all') {
        const cached = localStorage.getItem(`twms_masters_${type}`);
        if (cached) return JSON.parse(cached);
      }
    }
    return [];
  },

  addMasterItem: async (itemData) => {
    return fetch(`${BASE_URL}/masters`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(itemData)
    }).then(handleResponse);
  },

  updateMasterItem: async (id, itemData) => {
    return fetch(`${BASE_URL}/masters/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(itemData)
    }).then(handleResponse);
  },

  deleteMasterItem: async (id) => {
    return fetch(`${BASE_URL}/masters/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse);
  },

  syncMastersFromExisting: async () => {
    return fetch(`${BASE_URL}/masters/sync-existing`, {
      method: 'POST',
      headers: getHeaders()
    }).then(handleResponse);
  },

  // --- MASTER INVENTORY REPORT (Unified cross-table reporting) ---
  getMasterInventoryFilterOptions: async () => {
    return fetch(`${BASE_URL}/reports/master-inventory/filter-options`, {
      method: 'GET',
      headers: getHeaders()
    }).then(handleResponse);
  },

  getMasterInventoryReport: async (params = {}) => {
    const qs = new URLSearchParams();
    if (params.fabrics) {
      if (Array.isArray(params.fabrics)) qs.append('fabrics', params.fabrics.join(','));
      else qs.append('fabrics', params.fabrics);
    }
    if (params.shades) {
      if (Array.isArray(params.shades)) qs.append('shades', params.shades.join(','));
      else qs.append('shades', params.shades);
    }
    if (params.parties) {
      if (Array.isArray(params.parties)) qs.append('parties', params.parties.join(','));
      else qs.append('parties', params.parties);
    }
    if (params.status) qs.append('status', params.status);
    if (params.sourceTable) qs.append('sourceTable', params.sourceTable);
    if (params.search) qs.append('search', params.search);
    if (params.page) qs.append('page', params.page);
    if (params.limit) qs.append('limit', params.limit);
    if (params.exportAll) qs.append('exportAll', params.exportAll);

    return fetch(`${BASE_URL}/reports/master-inventory?${qs.toString()}`, {
      method: 'GET',
      headers: getHeaders()
    }).then(handleResponse);
  }
};


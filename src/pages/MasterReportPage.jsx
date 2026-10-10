import React, { useState, useEffect, useMemo, useRef } from 'react';
import { store } from '../store.js';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, FileText, Download, Filter, RefreshCw, Search,
  Check, X, ChevronDown, Layers, Scale, Package,
  ArrowUpDown, Database, AlertCircle, Printer, Eye,
  Sparkles, CheckCircle2, Clock, Tag, Box
} from 'lucide-react';
import '../Design/MasterReport.css';

/**
 * Standardize shade spelling and spacing in UI (without touching database)
 * E.g., '15 % MILLENGE', '15% MILLANGE', '15% MILLENGE' -> '15% MILLENGE'
 */
export const normalizeShade = (raw) => {
  if (!raw) return '';
  let s = String(raw).trim().replace(/\s+/g, ' ');
  // Handle space with percentage: "15 %" or "15  %" -> "15%"
  s = s.replace(/(\d+)\s*%/g, '$1%');
  // Ensure single space after percentage before letter: "15%MILLENGE" -> "15% MILLENGE"
  s = s.replace(/%([a-zA-Z])/g, '% $1');
  // Normalize variations of MILLANGE / MELANGE / MILANGE / MELENGE -> MILLENGE
  s = s.replace(/\bM[EI]LL?AN?GE\b/gi, 'MILLENGE');
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

/**
 * Standardize and treat fabric name variations as the exact same fabric
 * E.g., 'FABRIC MH FLEECE', 'FABRIC MH GERMAN FLEECE', 'GERMAN MH FLEECE' are identical
 */
export const canonicalizeFabricName = (raw) => {
  if (!raw) return '';
  const s = String(raw).trim();
  const upper = s.toUpperCase().replace(/\s+/g, ' ');
  if (
    upper === 'FABRIC MH FLEECE' ||
    upper === 'FABRIC MH GERMAN FLEECE' ||
    upper === 'GERMAN MH FLEECE' ||
    upper === 'MH FLEECE' ||
    upper === 'MH GERMAN FLEECE'
  ) {
    return 'FABRIC MH GERMAN FLEECE';
  }
  return s;
};

export const normalizeLot = (str) => String(str || '').trim().toUpperCase().replace(/[\s\-_/().]/g, '');

export default function MasterReportPage() {
  // State for filter options
  const [availableFabrics, setAvailableFabrics] = useState([]);
  const [availableShades, setAvailableShades] = useState([]);
  const [availableParties, setAvailableParties] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Selected filters
  const [selectedFabrics, setSelectedFabrics] = useState([]);
  const [selectedShades, setSelectedShades] = useState([]);
  const [selectedParties, setSelectedParties] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'in_stock', 'issued'
  const [sourceTableFilter, setSourceTableFilter] = useState('all'); // 'all', 'inventory', 'dyeing_material', 'material'
  const [searchKeyword, setSearchKeyword] = useState('');

  // Dropdown open states
  const [fabricDropdownOpen, setFabricDropdownOpen] = useState(false);
  const [shadeDropdownOpen, setShadeDropdownOpen] = useState(false);
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [fabricSearch, setFabricSearch] = useState('');
  const [shadeSearch, setShadeSearch] = useState('');
  const [partySearch, setPartySearch] = useState('');

  // Data & KPI states
  const [reportData, setReportData] = useState([]);
  const [summaryData, setSummaryData] = useState({
    totalRecords: 0,
    totalInStockRolls: 0,
    totalInStockWeight: 0,
    totalIssuedRolls: 0,
    totalIssuedWeight: 0,
    sourceBreakdown: {
      inventory: { count: 0, weight: 0, rolls: 0 },
      dyeing_material: { count: 0, weight: 0, rolls: 0 },
      material: { count: 0, weight: 0, rolls: 0 },
      pending_stock: { count: 0, weight: 0, rolls: 0 },
      dyeing_sheet: { count: 0, weight: 0, rolls: 0 }
    }
  });

  const [selectedSheetItem, setSelectedSheetItem] = useState(null);

  const [loadingData, setLoadingData] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  // Refs for clicking outside dropdowns
  const fabricRef = useRef(null);
  const shadeRef = useRef(null);
  const partyRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (fabricRef.current && !fabricRef.current.contains(e.target)) {
        setFabricDropdownOpen(false);
      }
      if (shadeRef.current && !shadeRef.current.contains(e.target)) {
        setShadeDropdownOpen(false);
      }
      if (partyRef.current && !partyRef.current.contains(e.target)) {
        setPartyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Load Filter Options (Fabrics & Shades across all 3 tables)
  const loadFilterOptions = async () => {
    setLoadingOptions(true);
    try {
      const res = await store.getMasterInventoryFilterOptions();
      if (res && res.success) {
        setAvailableFabrics(res.fabrics || []);
        setAvailableParties(res.parties || []);

        // Deduplicate and normalize shades for UI dropdown
        const shadeSet = new Set();
        const normShades = [];
        (res.shades || []).forEach(sh => {
          const n = normalizeShade(sh);
          if (n && !shadeSet.has(n.toUpperCase())) {
            shadeSet.add(n.toUpperCase());
            normShades.push(n);
          }
        });
        setAvailableShades(normShades.sort((a, b) => a.localeCompare(b)));
      }
    } catch (err) {
      console.error('Error loading master report filter options:', err);
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    loadFilterOptions();
  }, []);

  // 2. Fetch Master Report Data
  const fetchReportData = async (page = 1) => {
    setLoadingData(true);
    try {
      const params = {
        fabrics: selectedFabrics,
        shades: selectedShades,
        parties: selectedParties,
        status: statusFilter,
        sourceTable: sourceTableFilter,
        search: searchKeyword,
        page: page,
        limit: pageSize
      };

      const res = await store.getMasterInventoryReport(params);
      if (res && res.success) {
        setReportData(res.data || []);
        if (res.summary) setSummaryData(res.summary);
        if (res.pagination) {
          setTotalPages(res.pagination.totalPages || 1);
          setCurrentPage(res.pagination.page || 1);
        }
      }
    } catch (err) {
      console.error('Error fetching master report data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  // Re-fetch data when key filters change
  useEffect(() => {
    fetchReportData(1);
  }, [selectedFabrics, selectedShades, selectedParties, statusFilter, sourceTableFilter, pageSize]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReportData(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedFabrics([]);
    setSelectedShades([]);
    setSelectedParties([]);
    setStatusFilter('all');
    setSourceTableFilter('all');
    setSearchKeyword('');
    setCurrentPage(1);
  };

  // Toggle selection in multi-select
  const toggleFabric = (fabric) => {
    setSelectedFabrics(prev =>
      prev.includes(fabric) ? prev.filter(f => f !== fabric) : [...prev, fabric]
    );
  };

  const toggleShade = (shade) => {
    setSelectedShades(prev =>
      prev.includes(shade) ? prev.filter(s => s !== shade) : [...prev, shade]
    );
  };

  const toggleParty = (party) => {
    setSelectedParties(prev =>
      prev.includes(party) ? prev.filter(p => p !== party) : [...prev, party]
    );
  };

  // Filtered fabric, shade & party lists for dropdown searching
  const filteredFabrics = useMemo(() => {
    if (!fabricSearch.trim()) return availableFabrics;
    return availableFabrics.filter(f => f.toLowerCase().includes(fabricSearch.toLowerCase()));
  }, [availableFabrics, fabricSearch]);

  const filteredShades = useMemo(() => {
    if (!shadeSearch.trim()) return availableShades;
    return availableShades.filter(s => s.toLowerCase().includes(shadeSearch.toLowerCase()));
  }, [availableShades, shadeSearch]);

  const filteredParties = useMemo(() => {
    if (!partySearch.trim()) return availableParties;
    return availableParties.filter(p => p.toLowerCase().includes(partySearch.toLowerCase()));
  }, [availableParties, partySearch]);

  // 3. Download Full Master Excel Report (.xlsx)
  const handleDownloadExcel = async () => {
    setDownloadingExcel(true);
    try {
      // Request all matching records without pagination
      const params = {
        fabrics: selectedFabrics,
        shades: selectedShades,
        parties: selectedParties,
        status: statusFilter,
        sourceTable: sourceTableFilter,
        search: searchKeyword,
        exportAll: true
      };

      const res = await store.getMasterInventoryReport(params);
      const allItems = (res && res.allData) ? res.allData : reportData;

      if (!allItems || allItems.length === 0) {
        alert('No data to export for current filters.');
        return;
      }

      // Prepare Excel rows
      const excelRows = allItems.map((item, index) => ({
        'Sr No': index + 1,
        'Source Table': item.sourceLabel,
        'Barcode / Code': item.barcode,
        'Lot Number': item.lotNo,
        'Dyeing Sheet Linked': item.isSheetLinked ? 'YES' : 'NO',
        'Fabric Description': item.fabricName,
        'Shade / Color': normalizeShade(item.shade),
        'Party / CMF / Supplier': item.party,
        'Storage Shelf': item.location,
        'Rolls / Pkgs': item.rolls,
        'Weight / Quantity': item.weight,
        'Unit': item.unit,
        'Stock Status': item.statusLabel,
        'Date': item.date,
        'Bill / Challan No': item.billNo,
        'Dyeing Lot Number': item.pendingStock?.lotNo || item.dyeingSheet?.lotNo || item.lotNo || '—',
        'Rolls on Dyeing': item.pendingStock?.balanceRolls ?? item.pendingStock?.rolls ?? item.dyeingSheet?.balanceRolls ?? item.dyeingSheet?.rolls ?? '—',
        'Sheet Party': item.pendingStock?.party || item.dyeingSheet?.party || '—',
        'Sheet Challan': item.pendingStock?.issueNo || item.dyeingSheet?.issueNo || '—',
        'Sheet Balance (KG)': item.pendingStock?.balance ?? item.dyeingSheet?.balance ?? '—'
      }));

      // Create workbook & worksheet
      const ws = XLSX.utils.json_to_sheet(excelRows);
      const wb = XLSX.utils.book_new();

      // Column Widths
      ws['!cols'] = [
        { wch: 8 },  // Sr No
        { wch: 18 }, // Source Table
        { wch: 18 }, // Barcode
        { wch: 14 }, // Lot Number
        { wch: 30 }, // Fabric
        { wch: 18 }, // Shade
        { wch: 25 }, // Party
        { wch: 16 }, // Location
        { wch: 12 }, // Rolls
        { wch: 16 }, // Weight
        { wch: 8 },  // Unit
        { wch: 12 }, // Status
        { wch: 14 }, // Date
        { wch: 18 }  // Bill No
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Master Inventory Report');

      // Create filename with current date and filters
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `Master_Item_Wise_Inventory_Report_${dateStr}.xlsx`;

      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Error generating Excel report:', err);
      alert(`Failed to export Excel: ${err.message}`);
    } finally {
      setDownloadingExcel(false);
    }
  };

  // 4. Download CSV
  const handleDownloadCsv = () => {
    if (!reportData || reportData.length === 0) {
      alert('No data available to export.');
      return;
    }

    const headers = ['Sr No', 'Source Table', 'Barcode', 'Lot Number', 'Fabric Name', 'Shade', 'Party', 'Location', 'Rolls', 'Weight', 'Unit', 'Status', 'Date', 'Bill No'];
    const csvRows = [headers.join(',')];

    reportData.forEach((item, index) => {
      const row = [
        index + 1,
        `"${item.sourceLabel}"`,
        `"${item.barcode}"`,
        `"${item.lotNo}"`,
        `"${item.fabricName}"`,
        `"${normalizeShade(item.shade)}"`,
        `"${item.party}"`,
        `"${item.location}"`,
        item.rolls,
        item.weight,
        `"${item.unit}"`,
        `"${item.statusLabel}"`,
        `"${item.date}"`,
        `"${item.billNo}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `Master_Inventory_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 5. Download Master Summary PDF Report (.pdf)
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');

      // Request all matching records for complete export
      const params = {
        fabrics: selectedFabrics,
        shades: selectedShades,
        parties: selectedParties,
        status: statusFilter,
        sourceTable: sourceTableFilter,
        search: searchKeyword,
        exportAll: true
      };

      const res = await store.getMasterInventoryReport(params);
      const allItems = (res && res.allData) ? res.allData : reportData;

      if (!allItems || allItems.length === 0) {
        alert('No data available to generate PDF report.');
        return;
      }

      // Group by Fabric Name + Shade + Status (Consolidate into 1 row per shade)
      const groupMap = new Map();

      allItems.forEach((item) => {
        const fabric = canonicalizeFabricName(item.fabricName || 'Unknown Fabric').trim();
        const shade = normalizeShade(item.shade || '—');
        const status = item.statusLabel || (item.status === 'in_stock' ? 'IN STOCK' : 'ISSUED');

        const isSheetSource = item.sourceKey === 'pending_stock' || item.sourceKey === 'dyeing_sheet';
        const hasIssuedShade = Boolean(shade && shade !== '—' && shade.trim() !== '');

        // NEVER include standalone sheet records if no shade was issued against the lot!
        if (isSheetSource && !hasIssuedShade) {
          return;
        }

        const isSheetLinked = !!(item.pendingStock || item.dyeingSheet || isSheetSource);
        const sheet = item.pendingStock || item.dyeingSheet;
        
        // ONLY extract dyeing lot & rolls if a shade was actually issued against that lot
        let dyeingLot = '';
        let dyeingRolls = 0;

        if (isSheetLinked && hasIssuedShade) {
          dyeingLot = (sheet?.lotNo || item.lotNo || '').trim();
          if (sheet) {
            dyeingRolls = Number(sheet.balanceRolls ?? sheet.rolls ?? sheet.opRolls ?? 0);
          } else if (isSheetSource) {
            dyeingRolls = Number(item.rolls) || 0;
          }
        }

        // Physical store rolls in warehouse vs Dyeing rolls
        const storeRolls = isSheetSource ? 0 : (Number(item.rolls) || 1);

        // Group key is strictly Fabric + Shade + Status to ensure a SINGLE row per shade
        const key = `${fabric.toUpperCase()}___${shade.toUpperCase()}___${status.toUpperCase()}`;

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            fabricName: fabric,
            shade: shade,
            status: status,
            totalRolls: 0,
            barcodeCount: 0,
            dyeingLotsMap: new Map()
          });
        }

        const group = groupMap.get(key);
        group.totalRolls += storeRolls;
        if (!isSheetSource) {
          group.barcodeCount += 1;
        }

        if (hasIssuedShade && dyeingLot && dyeingLot !== '—') {
          const normLot = normalizeLot(dyeingLot) || dyeingLot;
          if (!group.dyeingLotsMap.has(normLot) || (group.dyeingLotsMap.get(normLot).rolls === 0 && dyeingRolls > 0)) {
            group.dyeingLotsMap.set(normLot, {
              lotNo: dyeingLot,
              rolls: dyeingRolls
            });
          }
        }
      });

      // Format consolidated groups: merge dyeing lots & rolls into the single row
      const summaryList = Array.from(groupMap.values())
        .map(group => {
          const dyeingEntries = Array.from(group.dyeingLotsMap.values());
          const uniqueLots = Array.from(new Set(dyeingEntries.map(e => e.lotNo).filter(l => l && l !== '—')));
          const dyeingLotNo = uniqueLots.length > 0 ? uniqueLots.join(', ') : '—';
          const rollsOnDyeing = dyeingEntries.reduce((sum, e) => sum + (Number(e.rolls) || 0), 0);

          return {
            ...group,
            dyeingLotNo,
            rollsOnDyeing
          };
        })
        .filter(g => {
          if (g.totalRolls === 0 && g.rollsOnDyeing === 0) return false;
          if ((!g.shade || g.shade === '—') && g.totalRolls === 0) return false;
          return true;
        })
        .sort((a, b) => {
          const comp = a.fabricName.localeCompare(b.fabricName);
          if (comp !== 0) return comp;
          return a.shade.localeCompare(b.shade);
        });

      const grandTotalRolls = summaryList.reduce((acc, g) => acc + (Number(g.totalRolls) || 0), 0);
      const grandTotalDyeingRolls = summaryList.reduce((acc, g) => acc + (Number(g.rollsOnDyeing) || 0), 0);

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const PAGE_W = doc.internal.pageSize.getWidth();
      const PAGE_H = doc.internal.pageSize.getHeight();
      const M = 24;
      const contentW = PAGE_W - 2 * M;

      const setFont = (style, size) => {
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
      };

      const drawPageBorder = () => {
        // Outer Page Border
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(1);
        doc.rect(13, 13, PAGE_W - 26, PAGE_H - 26);

        // Subtle Inner Decorative Border
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.rect(15.5, 15.5, PAGE_W - 31, PAGE_H - 31);
      };

      const drawHeader = (pageNum) => {
        drawPageBorder();

        // Top Banner Box
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.8);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(M, 20, contentW, 46, 4, 4, 'FD');

        // Brand & Title
        doc.setTextColor(30, 58, 138);
        setFont('bold', 11.5);
        doc.text('MOHIT HOSIERY — MASTER INVENTORY SUMMARY REPORT', M + 10, 37);

        setFont('normal', 7);
        doc.setTextColor(100, 116, 139);
        const filterFabricsText = selectedFabrics.length > 0 ? selectedFabrics.join(', ') : 'All Selected Fabrics';
        const filterShadesText = selectedShades.length > 0 ? selectedShades.join(', ') : 'All Shades';
        const filterPartiesText = selectedParties.length > 0 ? selectedParties.join(', ') : 'All Parties';
        const filterSummaryText = `Fabrics: (${filterFabricsText.length > 35 ? filterFabricsText.slice(0, 35) + '...' : filterFabricsText}) | Parties: (${filterPartiesText.length > 25 ? filterPartiesText.slice(0, 25) + '...' : filterPartiesText}) | Shades: (${filterShadesText.length > 25 ? filterShadesText.slice(0, 25) + '...' : filterShadesText}) | Status: ${statusFilter.toUpperCase()}`;
        doc.text(filterSummaryText, M + 10, 52);

        // Date and Page Right Aligned
        doc.setTextColor(71, 85, 105);
        setFont('bold', 7.5);
        const dateStr = new Date().toLocaleString();
        doc.text(`Generated: ${dateStr}`, PAGE_W - M - 10, 36, { align: 'right' });
        setFont('bold', 7);
        doc.setTextColor(30, 58, 138);
        doc.text(`Lots: ${summaryList.length} | Items: ${allItems.length}`, PAGE_W - M - 10, 46, { align: 'right' });
        setFont('normal', 7);
        doc.setTextColor(100, 116, 139);
        doc.text(`Page ${pageNum}`, PAGE_W - M - 10, 56, { align: 'right' });

        return 74;
      };

      // Table columns definition with DYEING LOT NUMBER and ROLLS ON DYEING after SHADE / COLOR
      const columns = [
        { key: 'sr', title: 'SR NO', w: 26, align: 'center' },
        { key: 'fabricName', title: 'FABRIC NAME / DESCRIPTION', w: 155, align: 'left' },
        { key: 'shade', title: 'SHADE / COLOR', w: 90, align: 'left' },
        { key: 'dyeingLotNo', title: 'DYEING LOT NUMBER', w: 90, align: 'left' },
        { key: 'rollsOnDyeing', title: 'ROLLS ON DYEING', w: 65, align: 'right' },
        { key: 'totalRolls', title: 'TOTAL ROLLS', w: 65, align: 'right' },
        { key: 'status', title: 'STATUS', w: 56.28, align: 'center' }
      ];

      const drawTableHeader = (currY) => {
        // Table Header Fill
        doc.setFillColor(30, 58, 138);
        doc.rect(M, currY, contentW, 19, 'F');

        // Table Header Outer Border
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.8);
        doc.rect(M, currY, contentW, 19, 'S');

        doc.setTextColor(255, 255, 255);
        setFont('bold', 7.2);

        let curX = M;
        columns.forEach((col, idx) => {
          let textX = curX + 4;
          if (col.align === 'center') textX = curX + col.w / 2;
          else if (col.align === 'right') textX = curX + col.w - 4;
          doc.text(col.title, textX, currY + 12.5, { align: col.align });

          // Vertical separator line between header columns
          if (idx > 0) {
            doc.setDrawColor(79, 105, 180);
            doc.setLineWidth(0.5);
            doc.line(curX, currY, curX, currY + 19);
          }

          curX += col.w;
        });

        return currY + 19;
      };

      let pageNum = 1;
      let y = drawHeader(pageNum);
      y = drawTableHeader(y);

      const rowHeight = 16.5;
      const maxY = PAGE_H - 36;

      summaryList.forEach((group, index) => {
        if (y + rowHeight > maxY) {
          // Close table bottom border on current page
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.8);
          doc.line(M, y, M + contentW, y);

          // Bottom footer on current page
          setFont('normal', 6.5);
          doc.setTextColor(148, 163, 184);
          doc.text('Confidential - Mohit Hosiery Fabric Inventory Management System', M + 4, PAGE_H - 18);

          doc.addPage();
          pageNum++;
          y = drawHeader(pageNum);
          y = drawTableHeader(y);
        }

        // Row background (zebra stripe)
        if (index % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(M, y, contentW, rowHeight, 'F');
        }

        // Horizontal bottom cell border line
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.line(M, y + rowHeight, M + contentW, y + rowHeight);

        // Vertical column dividers
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        let dividerX = M;
        for (let i = 0; i < columns.length - 1; i++) {
          dividerX += columns[i].w;
          doc.line(dividerX, y, dividerX, y + rowHeight);
        }

        // Table outer left & right vertical borders for this row
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.8);
        doc.line(M, y, M, y + rowHeight);
        doc.line(M + contentW, y, M + contentW, y + rowHeight);

        let curX = M;

        // 1. Sr No
        setFont('normal', 7);
        doc.setTextColor(100, 116, 139);
        doc.text(String(index + 1), curX + columns[0].w / 2, y + 11, { align: 'center' });
        curX += columns[0].w;

        // 2. Fabric Description
        setFont('bold', 7.5);
        doc.setTextColor(15, 23, 42);
        const fabricLines = doc.splitTextToSize(String(group.fabricName || '—'), columns[1].w - 8);
        doc.text(fabricLines[0] || '', curX + 4, y + 11);
        curX += columns[1].w;

        // 3. Shade / Color
        setFont('bold', 7.5);
        doc.setTextColor(51, 65, 85);
        const shadeLines = doc.splitTextToSize(String(group.shade || '—'), columns[2].w - 8);
        doc.text(shadeLines[0] || '', curX + 4, y + 11);
        curX += columns[2].w;

        // 4. Dyeing Lot Number
        setFont('bold', 7.5);
        doc.setTextColor(37, 99, 235);
        const lotLines = doc.splitTextToSize(String(group.dyeingLotNo || '—'), columns[3].w - 8);
        doc.text(lotLines[0] || '', curX + 4, y + 11);
        curX += columns[3].w;

        // 5. Rolls on Dyeing
        setFont('bold', 8);
        doc.setTextColor(79, 70, 229);
        doc.text(group.rollsOnDyeing > 0 ? Number(group.rollsOnDyeing).toLocaleString() : '—', curX + columns[4].w - 4, y + 11, { align: 'right' });
        curX += columns[4].w;

        // 6. Total Rolls
        setFont('bold', 8);
        doc.setTextColor(30, 58, 138);
        doc.text(Number(group.totalRolls).toLocaleString(), curX + columns[5].w - 4, y + 11, { align: 'right' });
        curX += columns[5].w;

        // 7. Status
        setFont('bold', 6.5);
        if (group.status.toUpperCase().includes('STOCK')) {
          doc.setTextColor(22, 101, 52);
          doc.text('IN STOCK', curX + columns[6].w / 2, y + 11, { align: 'center' });
        } else {
          doc.setTextColor(180, 83, 9);
          doc.text('ISSUED', curX + columns[6].w / 2, y + 11, { align: 'center' });
        }

        y += rowHeight;
      });

      // Grand Total Row
      if (y + 22 > maxY) {
        // Close table on previous page
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.8);
        doc.line(M, y, M + contentW, y);

        doc.addPage();
        pageNum++;
        y = drawHeader(pageNum);
        y = drawTableHeader(y);
      }

      // Grand Total Box Fill
      doc.setFillColor(241, 245, 249);
      doc.rect(M, y, contentW, 19, 'F');

      // Grand Total Box Outer Border
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.8);
      doc.rect(M, y, contentW, 19, 'S');

      // Vertical dividers for the Grand Total cells
      const labelW = columns[0].w + columns[1].w + columns[2].w + columns[3].w;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      doc.line(M + labelW, y, M + labelW, y + 19);
      doc.line(M + labelW + columns[4].w, y, M + labelW + columns[4].w, y + 19);
      doc.line(M + labelW + columns[4].w + columns[5].w, y, M + labelW + columns[4].w + columns[5].w, y + 19);

      let totalX = M;
      setFont('bold', 8);
      doc.setTextColor(30, 58, 138);
      // Span across SR NO + FABRIC + SHADE + DYEING LOT NUMBER
      doc.text(`GRAND TOTAL (${summaryList.length} Lots/Groups | ${allItems.length} Items):`, totalX + 8, y + 12.5);
      totalX += labelW;

      // Grand Total Rolls on Dyeing
      doc.setTextColor(79, 70, 229);
      setFont('bold', 8.5);
      doc.text(Number(grandTotalDyeingRolls).toLocaleString(), totalX + columns[4].w - 4, y + 12.5, { align: 'right' });
      totalX += columns[4].w;

      // Grand Total Total Rolls
      doc.setTextColor(30, 58, 138);
      setFont('bold', 8.5);
      doc.text(Number(grandTotalRolls).toLocaleString(), totalX + columns[5].w - 4, y + 12.5, { align: 'right' });
      totalX += columns[5].w;

      // Status column blank in grand total
      y += 22;

      // Bottom footer on last page
      setFont('normal', 6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Confidential - Mohit Hosiery Fabric Inventory Management System', M + 4, PAGE_H - 18);

      const fileName = `Master_Inventory_Summary_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Error generating PDF report:', err);
      alert(`Failed to export PDF: ${err.message}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedData = useMemo(() => {
    return [...reportData].sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [reportData, sortField, sortOrder]);

  return (
    <div className="master-report-container">
      {/* ── HEADER BANNER ────────────────────────────────────────── */}
      <div className="mr-header-banner">
        <div className="mr-title-group">
          <h1>
            <FileSpreadsheet size={26} style={{ color: '#2563EB' }} />
            <span>Master Item Wise Inventory Report</span>
            <span style={{ fontSize: '11px', background: '#DBEAFE', color: '#1E40AF', padding: '3px 9px', borderRadius: 6, fontWeight: 800 }}>
              4 SOURCES UNIFIED
            </span>
          </h1>
          <p>
            Consolidated cross-table stock intelligence combining <strong>Inventory</strong>, <strong>Dyeing Materials</strong>, <strong>Material Master</strong>, and <strong>PendingStock Sheet</strong>.
          </p>
        </div>

        <div className="mr-btn-group">
          <button
            type="button"
            className="mr-btn mr-btn-secondary"
            onClick={() => {
              loadFilterOptions();
              fetchReportData(currentPage);
            }}
            disabled={loadingData}
            title="Reload latest stock records"
          >
            <RefreshCw size={14} className={loadingData ? 'spin-animation' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="mr-btn mr-btn-secondary"
            onClick={handleDownloadCsv}
            disabled={reportData.length === 0}
            title="Download CSV file"
          >
            <Download size={14} />
            <span>CSV</span>
          </button>

          <button
            type="button"
            className="mr-btn mr-btn-indigo"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || reportData.length === 0}
            title="Download Fabric & Shade Summary PDF Report"
          >
            {downloadingPdf ? (
              <>
                <RefreshCw size={14} className="spin-animation" />
                <span>Exporting Summary PDF...</span>
              </>
            ) : (
              <>
                <FileText size={15} />
                <span>Download PDF Summary</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="mr-btn mr-btn-primary"
            onClick={handleDownloadExcel}
            disabled={downloadingExcel || reportData.length === 0}
            title="Download formatted Master Item-Wise Excel Spreadsheet"
          >
            {downloadingExcel ? (
              <>
                <RefreshCw size={14} className="spin-animation" />
                <span>Exporting Excel...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet size={15} />
                <span>Download Excel Report</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── KPI METRICS SUMMARY CARDS ───────────────────────────── */}
      <div className="mr-kpi-grid">
        <div className="mr-kpi-card">
          <div className="mr-kpi-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
            <Layers size={22} />
          </div>
          <div>
            <div className="mr-kpi-label">FILTERED ITEMS</div>
            <div className="mr-kpi-val">{summaryData.totalRecords.toLocaleString()}</div>
            <div className="mr-kpi-sub">Total matching entries</div>
          </div>
        </div>

        <div className="mr-kpi-card">
          <div className="mr-kpi-icon" style={{ background: '#DCFCE7', color: '#166534' }}>
            <Layers size={22} />
          </div>
          <div>
            <div className="mr-kpi-label">IN-STOCK ROLLS</div>
            <div className="mr-kpi-val" style={{ color: '#10B981' }}>
              {summaryData.totalInStockRolls.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 700 }}>Rolls</span>
            </div>
            <div className="mr-kpi-sub">Available rolls / pkgs in stock</div>
          </div>
        </div>

        <div className="mr-kpi-card">
          <div className="mr-kpi-icon" style={{ background: '#F3E8FF', color: '#7E22CE' }}>
            <Database size={22} />
          </div>
          <div>
            <div className="mr-kpi-label">TABLE SOURCES</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <span className="mr-source-badge mr-source-inv" title="Old Inventory Records">
                Inv: {summaryData.sourceBreakdown.inventory?.count || 0}
              </span>
              <span className="mr-source-badge mr-source-dye" title="Dyeing Inward Records">
                Dye: {summaryData.sourceBreakdown.dyeing_material?.count || 0}
              </span>
              <span className="mr-source-badge mr-source-mat" title="Material Master Records">
                Mat: {summaryData.sourceBreakdown.material?.count || 0}
              </span>
              <span className="mr-source-badge mr-source-pending" title="PendingStock Sheet (Google Sheet) Records">
                PendingStock: {summaryData.sourceBreakdown.pending_stock?.count || summaryData.sourceBreakdown.dyeing_sheet?.count || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FILTER STUDIO CONTROL BAR ───────────────────────────── */}
      <div className="mr-card mr-filter-card">
        <div className="mr-filter-grid">
          {/* 1. Fabric Name Multi-Select */}
          <div className="mr-filter-field" ref={fabricRef}>
            <label className="mr-filter-label">
              <span>Fabric Name</span>
              {selectedFabrics.length > 0 && (
                <span style={{ color: '#2563EB', fontWeight: 800 }}>
                  ({selectedFabrics.length} selected)
                </span>
              )}
            </label>

            <div
              className={`mr-multiselect-trigger ${fabricDropdownOpen ? 'active' : ''}`}
              onClick={() => {
                setFabricDropdownOpen(!fabricDropdownOpen);
                setShadeDropdownOpen(false);
                setPartyDropdownOpen(false);
              }}
            >
              <span style={{ color: selectedFabrics.length === 0 ? '#94A3B8' : 'inherit', fontWeight: selectedFabrics.length > 0 ? 750 : 500 }}>
                {selectedFabrics.length === 0
                  ? 'All Fabrics (3 Tables)'
                  : `${selectedFabrics.length} Fabric${selectedFabrics.length > 1 ? 's' : ''} selected`}
              </span>
              <ChevronDown size={15} style={{ color: '#64748B', transform: fabricDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </div>

            {fabricDropdownOpen && (
              <div className="mr-multiselect-popover">
                <div className="mr-popover-search">
                  <Search size={14} style={{ color: '#64748B' }} />
                  <input
                    type="text"
                    placeholder="Search fabric name..."
                    value={fabricSearch}
                    onChange={(e) => setFabricSearch(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '12px' }}
                    autoFocus
                  />
                </div>

                <div className="mr-popover-actions">
                  <span
                    style={{ cursor: 'pointer', color: '#2563EB' }}
                    onClick={() => {
                      const allVisible = filteredFabrics;
                      setSelectedFabrics(prev => Array.from(new Set([...prev, ...allVisible])));
                    }}
                  >
                    Select All ({filteredFabrics.length})
                  </span>
                  <span
                    style={{ cursor: 'pointer', color: '#EF4444' }}
                    onClick={() => setSelectedFabrics([])}
                  >
                    Clear
                  </span>
                </div>

                <div className="mr-popover-list">
                  {filteredFabrics.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', fontSize: '11.5px', color: '#94A3B8' }}>
                      No matching fabrics found
                    </div>
                  ) : (
                    filteredFabrics.map((fabric) => {
                      const isSelected = selectedFabrics.includes(fabric);
                      return (
                        <div
                          key={fabric}
                          className={`mr-popover-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleFabric(fabric)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{fabric}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Shade / Color Multi-Select */}
          <div className="mr-filter-field" ref={shadeRef}>
            <label className="mr-filter-label">
              <span>Shade / Color</span>
              {selectedShades.length > 0 && (
                <span style={{ color: '#2563EB', fontWeight: 800 }}>
                  ({selectedShades.length} selected)
                </span>
              )}
            </label>

            <div
              className={`mr-multiselect-trigger ${shadeDropdownOpen ? 'active' : ''}`}
              onClick={() => {
                setShadeDropdownOpen(!shadeDropdownOpen);
                setFabricDropdownOpen(false);
                setPartyDropdownOpen(false);
              }}
            >
              <span style={{ color: selectedShades.length === 0 ? '#94A3B8' : 'inherit', fontWeight: selectedShades.length > 0 ? 750 : 500 }}>
                {selectedShades.length === 0
                  ? 'All Shades (3 Tables)'
                  : `${selectedShades.length} Shade${selectedShades.length > 1 ? 's' : ''} selected`}
              </span>
              <ChevronDown size={15} style={{ color: '#64748B', transform: shadeDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </div>

            {shadeDropdownOpen && (
              <div className="mr-multiselect-popover">
                <div className="mr-popover-search">
                  <Search size={14} style={{ color: '#64748B' }} />
                  <input
                    type="text"
                    placeholder="Search shade / color..."
                    value={shadeSearch}
                    onChange={(e) => setShadeSearch(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '12px' }}
                    autoFocus
                  />
                </div>

                <div className="mr-popover-actions">
                  <span
                    style={{ cursor: 'pointer', color: '#2563EB' }}
                    onClick={() => {
                      const allVisible = filteredShades;
                      setSelectedShades(prev => Array.from(new Set([...prev, ...allVisible])));
                    }}
                  >
                    Select All ({filteredShades.length})
                  </span>
                  <span
                    style={{ cursor: 'pointer', color: '#EF4444' }}
                    onClick={() => setSelectedShades([])}
                  >
                    Clear
                  </span>
                </div>

                <div className="mr-popover-list">
                  {filteredShades.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', fontSize: '11.5px', color: '#94A3B8' }}>
                      No matching shades found
                    </div>
                  ) : (
                    filteredShades.map((shade) => {
                      const isSelected = selectedShades.includes(shade);
                      return (
                        <div
                          key={shade}
                          className={`mr-popover-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleShade(shade)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{shade}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. Party / Supplier Multi-Select */}
          <div className="mr-filter-field" ref={partyRef}>
            <label className="mr-filter-label">
              <span>Party / Supplier</span>
              {selectedParties.length > 0 && (
                <span style={{ color: '#2563EB', fontWeight: 800 }}>
                  ({selectedParties.length} selected)
                </span>
              )}
            </label>

            <div
              className={`mr-multiselect-trigger ${partyDropdownOpen ? 'active' : ''}`}
              onClick={() => {
                setPartyDropdownOpen(!partyDropdownOpen);
                setFabricDropdownOpen(false);
                setShadeDropdownOpen(false);
              }}
            >
              <span style={{ color: selectedParties.length === 0 ? '#94A3B8' : 'inherit', fontWeight: selectedParties.length > 0 ? 750 : 500 }}>
                {selectedParties.length === 0
                  ? 'All Parties / Suppliers'
                  : `${selectedParties.length} Part${selectedParties.length > 1 ? 'ies' : 'y'} selected`}
              </span>
              <ChevronDown size={15} style={{ color: '#64748B', transform: partyDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </div>

            {partyDropdownOpen && (
              <div className="mr-multiselect-popover">
                <div className="mr-popover-search">
                  <Search size={14} style={{ color: '#64748B' }} />
                  <input
                    type="text"
                    placeholder="Search party / supplier..."
                    value={partySearch}
                    onChange={(e) => setPartySearch(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '12px' }}
                    autoFocus
                  />
                </div>

                <div className="mr-popover-actions">
                  <span
                    style={{ cursor: 'pointer', color: '#2563EB' }}
                    onClick={() => {
                      const allVisible = filteredParties;
                      setSelectedParties(prev => Array.from(new Set([...prev, ...allVisible])));
                    }}
                  >
                    Select All ({filteredParties.length})
                  </span>
                  <span
                    style={{ cursor: 'pointer', color: '#EF4444' }}
                    onClick={() => setSelectedParties([])}
                  >
                    Clear
                  </span>
                </div>

                <div className="mr-popover-list">
                  {filteredParties.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', fontSize: '11.5px', color: '#94A3B8' }}>
                      No matching parties found
                    </div>
                  ) : (
                    filteredParties.map((party) => {
                      const isSelected = selectedParties.includes(party);
                      return (
                        <div
                          key={party}
                          className={`mr-popover-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleParty(party)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{party}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. Status Filter */}
          <div className="mr-filter-field">
            <label className="mr-filter-label">Stock Status</label>
            <select
              className="mr-select-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status (In Stock & Issued)</option>
              <option value="in_stock">🟢 In Stock (Available)</option>
              <option value="issued">🟡 Issued / Dispatched</option>
            </select>
          </div>

          {/* 5. Table Source Filter */}
          <div className="mr-filter-field">
            <label className="mr-filter-label">Source Table</label>
            <select
              className="mr-select-input"
              value={sourceTableFilter}
              onChange={(e) => setSourceTableFilter(e.target.value)}
            >
              <option value="all">All 4 Sources Unified</option>
              <option value="inventory">Old Inventory Table</option>
              <option value="dyeing_material">DyeingMaterials Table</option>
              <option value="material">Materials Table</option>
              <option value="pending_stock">PendingStock Sheet (Google Sheet)</option>
            </select>
          </div>

          {/* 6. Keyword Search */}
          <div className="mr-filter-field">
            <label className="mr-filter-label">Quick Search</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="mr-select-input"
                style={{ paddingLeft: 30 }}
                placeholder="Barcode, Lot #, Party, Location..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              {searchKeyword && (
                <X
                  size={14}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', cursor: 'pointer' }}
                  onClick={() => setSearchKeyword('')}
                />
              )}
            </div>
          </div>
        </div>

        {/* Active Tag Chips (Selected Filters) */}
        {(selectedFabrics.length > 0 || selectedShades.length > 0 || selectedParties.length > 0 || statusFilter !== 'all' || sourceTableFilter !== 'all' || searchKeyword) && (
          <div className="mr-active-tags">
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', marginRight: 4 }}>
              Active Filters:
            </span>

            {selectedFabrics.map((f) => (
              <span key={f} className="mr-tag-chip">
                <span>Fabric: {f}</span>
                <X size={12} className="mr-tag-remove" onClick={() => toggleFabric(f)} />
              </span>
            ))}

            {selectedShades.map((s) => (
              <span key={s} className="mr-tag-chip" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#7E22CE', borderColor: 'rgba(168, 85, 247, 0.25)' }}>
                <span>Shade: {s}</span>
                <X size={12} className="mr-tag-remove" onClick={() => toggleShade(s)} />
              </span>
            ))}

            {selectedParties.map((p) => (
              <span key={p} className="mr-tag-chip" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#1D4ED8', borderColor: 'rgba(59, 130, 246, 0.25)' }}>
                <span>Party: {p}</span>
                <X size={12} className="mr-tag-remove" onClick={() => toggleParty(p)} />
              </span>
            ))}

            {statusFilter !== 'all' && (
              <span className="mr-tag-chip" style={{ background: statusFilter === 'in_stock' ? '#DCFCE7' : '#FEF3C7', color: statusFilter === 'in_stock' ? '#166534' : '#92400E' }}>
                <span>Status: {statusFilter === 'in_stock' ? 'In Stock' : 'Issued'}</span>
                <X size={12} className="mr-tag-remove" onClick={() => setStatusFilter('all')} />
              </span>
            )}

            {sourceTableFilter !== 'all' && (
              <span className="mr-tag-chip">
                <span>Source: {sourceTableFilter}</span>
                <X size={12} className="mr-tag-remove" onClick={() => setSourceTableFilter('all')} />
              </span>
            )}

            <button
              type="button"
              onClick={handleResetFilters}
              style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '11px', fontWeight: 800, cursor: 'pointer', padding: '2px 6px', textDecoration: 'underline' }}
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* ── MASTER DATA TABLE ────────────────────────────────────── */}
      <div className="mr-table-wrapper">
        <table className="mr-table">
          <thead>
            <tr>
              <th style={{ width: 45 }}>#</th>
              <th onClick={() => handleSort('sourceLabel')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Source Table</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('barcode')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Barcode / ID</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('lotNo')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Lot No</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('fabricName')} style={{ cursor: 'pointer', minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Fabric Description</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('shade')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Shade / Color</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('party')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Party / Supplier</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('location')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Location</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('rolls')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <span>Rolls</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('weight')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <span>Weight / Qty</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span>Status</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Date</span>
                  <ArrowUpDown size={12} />
                </div>
              </th>
              <th>Bill / Challan</th>
            </tr>
          </thead>
          <tbody>
            {loadingData ? (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <RefreshCw size={24} className="spin-animation" style={{ color: '#2563EB' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748B' }}>
                      Querying Inventory, DyeingMaterials, and Materials tables...
                    </span>
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={32} style={{ color: '#94A3B8' }} />
                    <div style={{ fontSize: '14px', fontWeight: 800 }}>No Inventory Records Found</div>
                    <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: 400 }}>
                      Try adjusting the Fabric Name, Shade, Stock Status, or Keyword search filters above.
                    </p>
                    <button
                      type="button"
                      className="mr-btn mr-btn-secondary"
                      onClick={handleResetFilters}
                      style={{ marginTop: 8 }}
                    >
                      Clear All Filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map((item, index) => {
                const srNo = (currentPage - 1) * pageSize + index + 1;
                const sourceBadgeClass =
                  item.sourceKey === 'inventory'
                    ? 'mr-source-inv'
                    : item.sourceKey === 'dyeing_material'
                    ? 'mr-source-dye'
                    : (item.sourceKey === 'pending_stock' || item.sourceKey === 'dyeing_sheet')
                    ? 'mr-source-pending'
                    : 'mr-source-mat';

                const statusClass = item.status === 'in_stock' ? 'mr-status-in-stock' : 'mr-status-issued';

                return (
                  <tr key={item.id}>
                    <td style={{ color: '#94A3B8', fontWeight: 700, fontSize: '11.5px' }}>{srNo}</td>
                    <td>
                      <span className={`mr-source-badge ${sourceBadgeClass}`}>
                        {item.sourceLabel}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', fontSize: '12px' }}>
                        {item.barcode}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800 }}>{item.lotNo}</span>
                        {(item.isPendingStockLinked || item.isSheetLinked) && (
                          <button
                            type="button"
                            className="mr-sheet-linked-pill"
                            onClick={() => setSelectedSheetItem(item)}
                            title="Click to view linked PendingStock Sheet details"
                          >
                            <Sparkles size={11} style={{ color: '#4F46E5' }} />
                            <span>PendingStock Linked</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                        {item.fabricName}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 750, color: '#475569' }}>
                        {normalizeShade(item.shade)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px' }}>{item.party}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669' }}>
                        {item.location}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                      {item.rolls}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 900, color: '#2563EB', fontSize: '13px' }}>
                      {Number(item.weight).toFixed(2)} <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>{item.unit}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`mr-status-pill ${statusClass}`}>
                        {item.statusLabel}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                      {item.date}
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                      {item.billNo}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── PAGINATION BAR ───────────────────────────────────────── */}
      <div className="mr-pagination-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Show:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="mr-select-input"
            style={{ width: 80, height: 32, padding: '0 8px' }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
          </select>
          <span style={{ color: '#64748B' }}>
            Showing {reportData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, summaryData.totalRecords)} of {summaryData.totalRecords.toLocaleString()} items
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="mr-btn mr-btn-secondary"
            disabled={currentPage <= 1 || loadingData}
            onClick={() => fetchReportData(currentPage - 1)}
            style={{ padding: '6px 12px', height: 32 }}
          >
            Previous
          </button>

          <span style={{ padding: '0 8px', fontWeight: 800 }}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            className="mr-btn mr-btn-secondary"
            disabled={currentPage >= totalPages || loadingData}
            onClick={() => fetchReportData(currentPage + 1)}
            style={{ padding: '6px 12px', height: 32 }}
          >
            Next
          </button>
        </div>
      </div>

      {/* ── MODAL: LINKED DYEING SHEET DETAILS ──────────────────────── */}
      {selectedSheetItem && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
          onClick={() => setSelectedSheetItem(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: 540,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              border: '1px solid #CBD5E1',
              overflow: 'hidden',
              animation: 'fadeIn 0.15s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #1E40AF 0%, #1D4ED8 100%)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Sparkles size={20} style={{ color: '#93C5FD' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 850 }}>
                    Linked PendingStock Sheet Details
                  </h3>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>
                    Sheet: <strong>PendingStock</strong> | Lot No: <strong>{selectedSheetItem.lotNo}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSheetItem(null)}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#ffffff',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            {(() => {
              const sheet = selectedSheetItem.pendingStock || selectedSheetItem.dyeingSheet || {};
              return (
                <div style={{ padding: 20 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      background: '#F8FAFC',
                      padding: 16,
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      fontSize: 12.5
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        Sheet Party / Mill
                      </div>
                      <div style={{ fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                        {sheet.party || selectedSheetItem.party || '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        Issue Challan No
                      </div>
                      <div style={{ fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                        {sheet.issueNo || selectedSheetItem.billNo || '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        Issue Date
                      </div>
                      <div style={{ fontWeight: 700, color: '#334155', marginTop: 2 }}>
                        {sheet.issueDate || selectedSheetItem.date || '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        Sheet Shade / Color
                      </div>
                      <div style={{ fontWeight: 800, color: '#7E22CE', marginTop: 2 }}>
                        {normalizeShade(sheet.shade || selectedSheetItem.shade) || '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        Balance Weight
                      </div>
                      <div style={{ fontWeight: 900, color: '#059669', fontSize: 14, marginTop: 2 }}>
                        {sheet.balance !== undefined ? `${Number(sheet.balance).toFixed(2)} KG` : '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        Sheet Rolls
                      </div>
                      <div style={{ fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                        {sheet.rolls || '1'} Rolls
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        Issued Qty
                      </div>
                      <div style={{ fontWeight: 700, color: '#475569', marginTop: 2 }}>
                        {sheet.issueQty ? `${Number(sheet.issueQty).toFixed(2)} KG` : '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        Opening Qty
                      </div>
                      <div style={{ fontWeight: 700, color: '#475569', marginTop: 2 }}>
                        {sheet.opQty ? `${Number(sheet.opQty).toFixed(2)} KG` : '—'}
                      </div>
                    </div>
                  </div>

                  {sheet.remarks && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
                      <strong>Remarks:</strong> {sheet.remarks}
                    </div>
                  )}

                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      className="mr-btn mr-btn-secondary"
                      onClick={() => setSelectedSheetItem(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

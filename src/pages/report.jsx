import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../store.js';
import * as XLSX from 'xlsx-js-style';
import {
  Search, Printer, Download, ArrowLeft, AlertTriangle, CheckCircle2,
  Droplets, RefreshCw, SlidersHorizontal, Scale, ArrowUpDown, Plus,
  FileText, Database, Layers, FileDown, Lightbulb, CheckSquare,
  Sparkles, X, ShieldCheck, Ruler, Eye, HelpCircle, ClipboardCheck,
  Check, Save, Gauge, Maximize2, Boxes, Receipt, ListFilter
} from 'lucide-react';
import { generateAndDownloadPdf } from '../utils/shortagePdfGenerator.js';

export default function DyeingShortageReport() {
  const navigate = useNavigate();
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [scenarioFilter, setScenarioFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');

  // Modals state
  const [showTipsModal, setShowTipsModal] = useState(false);
  const [selectedInspectionRecord, setSelectedInspectionRecord] = useState(null);
  const [savingInspection, setSavingInspection] = useState(false);

  // Form State for Inspection Dialog
  const defaultInspectionForm = {
    fabricClean: 'YES',          // 1. FABRIC SAAF HAI YA NHI
    fabricHandFeel: 'OK',        // 2. FABRIC KI HAND FEEL THIK HAI YA NHI
    readyDia: '',                // 3. READY DIA KITNA HAI
    readyGsm: '',                // 4. READY GSM KITNA HAI
    ribDia: '',                  // 5. RIB KA DIA KITNA HAI
    ribClean: 'YES',             // 6. RIB SAAF HAI YA NHI
    ribMatching: 'OK',           // 7. KAPDA S RIB KI MATCHING OK HAI YA NHI
    overallVerdict: 'APPROVED',  // APPROVED / REJECTED
    inspectedBy: 'Store QC Operator',
    remarks: ''
  };

  const [inspectionForm, setInspectionForm] = useState(defaultInspectionForm);

  // Inspection Guidelines
  const inspectionTips = [
    {
      id: 1,
      title: 'FABRIC SAAF HAI YA NHI',
      desc: 'Cleanliness check: Fabric surface is clean without oil spots, dirt, dust, or stains.',
      icon: Eye,
      tag: 'Surface Check'
    },
    {
      id: 2,
      title: 'FABRIC KI HAND FEEL THIK HAI YA NHI',
      desc: 'Hand feel check: Fabric softness, finish, and texture touch is as per standard sample.',
      icon: Sparkles,
      tag: 'Touch & Feel'
    },
    {
      id: 3,
      title: 'READY DIA KITNA HAI',
      desc: 'Finished DIA check: Measure finished width/DIA in inches/cm and verify with technical spec sheet.',
      icon: Ruler,
      tag: 'Finished Width'
    },
    {
      id: 4,
      title: 'READY GSM KITNA HAI',
      desc: 'Finished GSM check: Cut round sample with GSM cutter, weigh on precision scale.',
      icon: Gauge,
      tag: 'GSM Density'
    },
    {
      id: 5,
      title: 'RIB KA DIA KITNA HAI',
      desc: 'RIB DIA check: Measure tubular/open rib width compliance with garment collar/cuff requirement.',
      icon: Maximize2,
      tag: 'RIB Width'
    },
    {
      id: 6,
      title: 'RIB SAAF HAI YA NHI',
      desc: 'RIB Cleanliness: Inspect RIB rolls for fluff, hair, dirt, stains or knitting oil defects.',
      icon: ShieldCheck,
      tag: 'RIB Quality'
    },
    {
      id: 7,
      title: 'KAPDA S RIB KI MATCHING OK HAI YA NHI',
      desc: 'Shade matching: Ensure Main Fabric and RIB color tone, depth, and wash appearance match 100%.',
      icon: CheckCircle2,
      tag: 'Color Match'
    }
  ];

  // Load Shortage Reports from MySQL database
  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const dbRes = await Promise.race([
        store.getShortageReports(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out. Please check your connection or click Retry.')), 15000)
        )
      ]);
      if (dbRes && dbRes.success && Array.isArray(dbRes.data)) {
        const mapped = dbRes.data.map(r => {
          let parsedEntries = r.selectedEntries;
          if (typeof parsedEntries === 'string') {
            try {
              parsedEntries = JSON.parse(parsedEntries);
            } catch (e) {
              parsedEntries = [];
            }
          }
          if (!Array.isArray(parsedEntries)) {
            parsedEntries = [];
          }

          let parsedInspection = r.inspectionDetails;
          if (typeof parsedInspection === 'string') {
            try {
              parsedInspection = JSON.parse(parsedInspection);
            } catch (e) {
              parsedInspection = null;
            }
          }

          const issRolls = parseInt(r.issuedRolls) || 0;
          const matchingEntry = parsedEntries.find(it =>
            String(it.fabricName || it.fabric || '').trim().toLowerCase() === String(r.fabricName || '').trim().toLowerCase()
          );
          const recdRolls = matchingEntry
            ? (parseInt(matchingEntry.recdRolls !== undefined ? matchingEntry.recdRolls : (matchingEntry.totalRolls || matchingEntry.issueRolls || 0)) || issRolls)
            : (parseInt(r.recdRolls) || issRolls);
          const sentWt = parseFloat(r.issuedQty) || 0;
          const billedWt = parseFloat(r.billedQty) || sentWt;
          const recdWt = parseFloat(r.recdWeight) || 0;

          // Shortage against Billed Weight (or Issued if no Billed)
          const baseBillWt = billedWt > 0 ? billedWt : sentWt;
          const diffWt = parseFloat(r.shortageQty) || Math.max(0, parseFloat((baseBillWt - recdWt).toFixed(3)));
          const pct = parseFloat(r.shortagePercentage) || (baseBillWt > 0 ? parseFloat(((diffWt / baseBillWt) * 100).toFixed(2)) : 0);

          // Pending Stock with Mill (when Issued > Billed)
          const pendingStockWithMill = Math.max(0, parseFloat((sentWt - billedWt).toFixed(3)));

          // Scenario Classification (Case 1, Case 2, Case 3, Case 3b)
          let scenarioCode = 'Case1';
          let scenarioTitle = 'Case 1: Full & Equal';
          let scenarioBadge = 'bg-emerald-100 text-emerald-800 border-emerald-300';
          let scenarioDesc = '100% Balanced (0% Shortage)';

          if (sentWt > billedWt) {
            if (recdWt < billedWt) {
              scenarioCode = 'Case3b';
              scenarioTitle = 'Case 3b: Partial + Shortage';
              scenarioBadge = 'bg-rose-100 text-rose-900 border-rose-300';
              scenarioDesc = `${diffWt.toFixed(2)} kg Loss | ${pendingStockWithMill.toFixed(2)} kg at Mill`;
            } else {
              scenarioCode = 'Case3';
              scenarioTitle = 'Case 3: Partial Bill Delivery';
              scenarioBadge = 'bg-blue-100 text-blue-900 border-blue-300';
              scenarioDesc = `Current Bill 0% | ${pendingStockWithMill.toFixed(2)} kg at Mill`;
            }
          } else if (recdWt < billedWt) {
            scenarioCode = 'Case2';
            scenarioTitle = 'Case 2: Dyeing Shortage';
            scenarioBadge = 'bg-amber-100 text-amber-900 border-amber-300';
            scenarioDesc = `Shortage: ${diffWt.toFixed(2)} kg (${pct}%)`;
          }

          return {
            ...r,
            id: r.id,
            dbId: r.id,
            billNumber: r.billNumber || '—',
            lotNumber: r.lotNumber || '—',
            jobOrderNo: r.jobOrderNo || '—',
            batchNumber: r.jobOrderNo || r.tableNo || '—',
            brand: r.cmfParty || '—',
            cmfParty: r.cmfParty || '—',
            fabric: r.fabricName || '—',
            fabricName: r.fabricName || '—',
            sentShade: r.shade || '—',
            shade: r.shade || '—',
            tableNo: r.tableNo || '—',
            unit: r.unit || 'KGs',
            issuedRolls: issRolls,
            sentRolls: issRolls,
            receivedRolls: recdRolls,
            rollDiff: Math.max(0, issRolls - recdRolls),
            issuedQty: sentWt,
            billedQty: billedWt,
            sentWeight: sentWt,
            receivedWeight: recdWt,
            recdWeight: recdWt,
            shortageQty: diffWt,
            weightDiff: diffWt,
            shortagePercentage: pct,
            shortagePct: pct,
            pendingStock: pendingStockWithMill,
            scenarioCode,
            scenarioTitle,
            scenarioBadge,
            scenarioDesc,
            reason: r.reason || 'Variance Audit',
            reportedBy: r.reportedBy || 'Store Operator',
            date: r.date || '—',
            issueDate: r.issueDate || '—',
            remarks: r.remarks || '',
            process: r.process || 'GERMAN FINISH',
            status: pct > 10 || diffWt > 50 ? 'Reject' : 'Approved',
            source: 'Shortage Form DB',
            selectedEntries: parsedEntries,
            inspectionDetails: parsedInspection,
            createdAt: r.createdAt
          };
        });
        setReportData(mapped);
      } else {
        setReportData([]);
      }
    } catch (err) {
      console.error('Error fetching dyeing shortage reports from DB:', err);
      setError(err.message || 'Failed to load shortage reports from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  // Filter and Sort Logic
  const processedData = useMemo(() => {
    let result = [...reportData];

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(item =>
        String(item.lotNumber || '').toLowerCase().includes(q) ||
        String(item.billNumber || '').toLowerCase().includes(q) ||
        String(item.brand || '').toLowerCase().includes(q) ||
        String(item.cmfParty || '').toLowerCase().includes(q) ||
        String(item.fabric || '').toLowerCase().includes(q) ||
        String(item.sentShade || '').toLowerCase().includes(q) ||
        String(item.reason || '').toLowerCase().includes(q) ||
        String(item.jobOrderNo || '').toLowerCase().includes(q) ||
        String(item.tableNo || '').toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'All') {
      result = result.filter(item => item.status === statusFilter);
    }

    if (scenarioFilter !== 'All') {
      result = result.filter(item => item.scenarioCode === scenarioFilter || (scenarioFilter === 'Case3' && item.scenarioCode === 'Case3b'));
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return (b.dbId || 0) - (a.dbId || 0);
        case 'shortagePctDesc':
          return b.shortagePct - a.shortagePct;
        case 'shortagePctAsc':
          return a.shortagePct - b.shortagePct;
        case 'lotNumberAsc':
          return String(a.lotNumber).localeCompare(String(b.lotNumber));
        case 'lotNumberDesc':
          return String(b.lotNumber).localeCompare(String(a.lotNumber));
        case 'sentWeightDesc':
          return b.sentWeight - a.sentWeight;
        case 'weightDiffDesc':
          return b.weightDiff - a.weightDiff;
        case 'pendingStockDesc':
          return b.pendingStock - a.pendingStock;
        default:
          return (b.dbId || 0) - (a.dbId || 0);
      }
    });

    return result;
  }, [reportData, searchQuery, statusFilter, scenarioFilter, sortBy]);

  // Summary KPI Metrics
  const metrics = useMemo(() => {
    let totalSentWeight = 0;
    let totalBilledWeight = 0;
    let totalReceivedWeight = 0;
    let totalWeightShortage = 0;
    let totalPendingAtMill = 0;
    let rejectCount = 0;
    let approvedCount = 0;
    let inspectedCount = 0;
    let case1Count = 0;
    let case2Count = 0;
    let case3Count = 0;

    processedData.forEach(item => {
      totalSentWeight += item.sentWeight || 0;
      totalBilledWeight += item.billedQty || item.sentWeight || 0;
      totalReceivedWeight += item.receivedWeight || 0;
      totalWeightShortage += item.weightDiff || 0;
      totalPendingAtMill += item.pendingStock || 0;

      if (item.status === 'Reject') {
        rejectCount++;
      } else {
        approvedCount++;
      }
      if (item.inspectionDetails && item.inspectionDetails.overallVerdict) {
        inspectedCount++;
      }

      if (item.scenarioCode === 'Case1') case1Count++;
      else if (item.scenarioCode === 'Case2') case2Count++;
      else if (item.scenarioCode === 'Case3' || item.scenarioCode === 'Case3b') case3Count++;
    });

    const overallShortagePct = totalBilledWeight > 0
      ? parseFloat(((totalWeightShortage / totalBilledWeight) * 100).toFixed(2))
      : 0;

    return {
      totalSentWeight,
      totalBilledWeight,
      totalReceivedWeight,
      totalWeightShortage,
      totalPendingAtMill,
      overallShortagePct,
      rejectCount,
      approvedCount,
      inspectedCount,
      case1Count,
      case2Count,
      case3Count,
      totalCount: processedData.length
    };
  }, [processedData]);

  // Open Inspection Dialog for a specific record
  const handleOpenInspection = (record) => {
    setSelectedInspectionRecord(record);
    if (record.inspectionDetails) {
      setInspectionForm({
        ...defaultInspectionForm,
        ...record.inspectionDetails
      });
    } else {
      setInspectionForm({
        ...defaultInspectionForm,
        readyDia: '',
        readyGsm: '',
        ribDia: '',
        remarks: ''
      });
    }
  };

  // Submit & Save Inspection
  const handleSaveInspection = async (e) => {
    e?.preventDefault?.();
    if (!selectedInspectionRecord) return;

    try {
      setSavingInspection(true);
      const inspectionPayload = {
        inspectionDetails: {
          ...inspectionForm,
          inspectedAt: new Date().toISOString()
        },
        lotNumber: selectedInspectionRecord.lotNumber,
        billNumber: selectedInspectionRecord.billNumber
      };

      const res = await store.updateShortageInspection(selectedInspectionRecord.id || selectedInspectionRecord.dbId, inspectionPayload);
      if (res && res.success) {
        setSelectedInspectionRecord(null);
        await fetchReport();
      } else {
        alert('Failed to save inspection: ' + (res?.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Inspection save error:', err);
      alert('Error saving inspection: ' + err.message);
    } finally {
      setSavingInspection(false);
    }
  };

  // Export to CSV
  const handleExport = () => {
    if (!processedData.length) return;

    const data = processedData.map((item, index) => ({
      "S.No": index + 1,
      "Bill Number": item.billNumber || '—',
      "Lot Number": item.lotNumber || '—',
      "Job Order": item.jobOrderNo || '—',
      "Party/Brand": item.brand || '—',
      "Fabric Name": item.fabric || '—',
      "Shade": item.sentShade || '—',
      "Sent Rolls": item.sentRolls || 0,
      "Received Rolls": item.receivedRolls || 0,
      "Roll Shortage": item.rollDiff || 0,
      "Sent Weight (KG)": item.sentWeight || 0,
      "Received Weight (KG)": item.receivedWeight || 0,
      "Weight Shortage (KG)": item.weightDiff || 0,
      "Shortage %": `${item.shortagePct}%`,
      "Shortage Status": item.status || '—',
      "QC Inspection": item.inspectionDetails?.overallVerdict || 'Pending'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shortage Report");
    XLSX.writeFile(wb, `Dyeing_Shortage_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadPdf = (record) => {
    let entries = record.selectedEntries;
    if (typeof entries === 'string') {
      try {
        entries = JSON.parse(entries);
      } catch (e) {
        entries = [];
      }
    }
    if (!Array.isArray(entries)) {
      entries = [];
    }

    if (entries.length <= 1) {
      const siblings = reportData.filter(item =>
        String(item.lotNumber).trim().toLowerCase() === String(record.lotNumber).trim().toLowerCase() &&
        (
          String(item.billNumber).trim() === String(record.billNumber).trim() ||
          String(item.date).trim() === String(record.date).trim()
        )
      );

      if (siblings.length > 1) {
        entries = siblings.map(s => ({
          fabricName: s.fabric || s.fabricName,
          shade: s.sentShade || s.shade,
          billNumber: s.billNumber,
          issueNo: s.billNumber,
          jobOrderNo: s.jobOrderNo,
          totalRolls: s.issuedRolls || s.sentRolls,
          issueRolls: s.issuedRolls || s.sentRolls,
          recdRolls: s.receivedRolls || s.issuedRolls,
          issueQty: s.sentWeight || s.issuedQty,
          billedQty: s.billedQty || s.sentWeight,
          recdWeight: s.receivedWeight || s.recdWeight,
          shortage: s.weightDiff || s.shortageQty,
          shortagePercentage: s.shortagePct || s.shortagePercentage,
          party: s.cmfParty || s.brand,
          process: s.process
        }));
      }
    }

    const payloadForPdf = {
      ...record,
      selectedEntries: entries.length > 0 ? entries : record.selectedEntries
    };
    generateAndDownloadPdf(payloadForPdf);
  };

  const handlePrint = () => window.print();

  return (
    <div className="dyeing-report-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;700;800&display=swap');

        .dyeing-report-app {
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: #0F172A;
          width: 100% !important;
          max-width: 100% !important;
          padding: 0 0 32px 0 !important;
          min-height: 100%;
          background-color: transparent;
        }

        .report-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Top Header Card (Luxury & Full Width) */
        .report-header-card {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 16px;
          padding: 18px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          flex-wrap: wrap;
          gap: 16px;
          width: 100%;
          box-sizing: border-box;
        }
        .dark .report-header-card {
          background: #1e293b;
          border-color: #334155;
        }

        .header-title-wrap {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .btn-back-link {
          background: #F8FAFC;
          border: 1.5px solid #CBD5E1;
          color: #334155;
          padding: 7px 12px;
          border-radius: 10px;
          font-size: 12.5px;
          font-weight: 750;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .dark .btn-back-link {
          background: #0f172a;
          border-color: #334155;
          color: #f8fafc;
        }
        .btn-back-link:hover {
          background: #EEF2FF;
          border-color: #3B82F6;
          color: #1D4ED8;
          transform: translateX(-2px);
        }

        .header-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #1E40AF 0%, #2563EB 50%, #06B6D4 100%);
          color: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
          flex-shrink: 0;
        }

        .header-title-text h1 {
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -0.4px;
          margin: 0;
          color: #0F172A;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .dark .header-title-text h1 {
          color: #f8fafc;
        }

        .header-title-text p {
          margin: 3px 0 0 0;
          font-size: 13px;
          color: #64748B;
          font-weight: 500;
        }
        .dark .header-title-text p {
          color: #94a3b8;
        }

        .header-btn-group {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* Fabric Inspection Tips Button */
        .btn-tips {
          background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
          color: #92400E;
          border: 1.5px solid #FCD34D;
          font-weight: 800;
          font-size: 12.5px;
          padding: 8px 14px;
          border-radius: 10px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          box-shadow: 0 2px 6px rgba(245, 158, 11, 0.2);
          transition: all 0.2s ease;
        }
        .btn-tips:hover {
          background: linear-gradient(135deg, #FDE68A 0%, #F59E0B 100%);
          color: #78350F;
          transform: translateY(-1px);
        }

        .btn {
          padding: 8px 14px;
          font-size: 12.5px;
          font-weight: 750;
          border-radius: 10px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }

        .btn-primary {
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%) !important;
          color: #FFFFFF !important;
          border: none !important;
          box-shadow: 0 3px 10px rgba(37, 99, 235, 0.3) !important;
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%) !important;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4) !important;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: #FFFFFF;
          color: #334155;
          border: 1.5px solid #CBD5E1;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .dark .btn-secondary {
          background: #0f172a;
          border-color: #334155;
          color: #f8fafc;
        }
        .btn-secondary:hover {
          background: #F8FAFC;
          color: #0F172A;
          border-color: #94A3B8;
          transform: translateY(-1px);
        }

        /* 5-Column Responsive Metric Cards Grid */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 16px;
          width: 100%;
        }

        .kpi-card {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 14px;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
          position: relative;
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .dark .kpi-card {
          background: #1e293b;
          border-color: #334155;
        }
        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.06);
        }

        .kpi-card.sent { border-top: 3.5px solid #2563EB; }
        .kpi-card.received { border-top: 3.5px solid #10B981; }
        .kpi-card.shortage { border-top: 3.5px solid #EF4444; }
        .kpi-card.pending-stock { border-top: 3.5px solid #8B5CF6; }

        .kpi-data-block {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .kpi-label {
          font-size: 11px;
          font-weight: 800;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .dark .kpi-label {
          color: #94a3b8;
        }

        .kpi-value {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.4px;
          font-family: 'JetBrains Mono', monospace;
          color: #0F172A;
          line-height: 1.2;
          margin-top: 2px;
        }
        .dark .kpi-value {
          color: #f8fafc;
        }

        .kpi-sub {
          font-size: 11px;
          color: #94A3B8;
          font-weight: 600;
          margin-top: 2px;
        }

        .kpi-icon-pill {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 20px;
        }

        .kpi-card.sent .kpi-icon-pill { background: #EFF6FF; color: #2563EB; border: 1px solid rgba(37, 99, 235, 0.2); }
        .kpi-card.received .kpi-icon-pill { background: #ECFDF5; color: #10B981; border: 1px solid rgba(16, 185, 129, 0.2); }
        .kpi-card.shortage .kpi-icon-pill { background: #FEF2F2; color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.2); }
        .kpi-card.pending-stock .kpi-icon-pill { background: #F5F3FF; color: #7C3AED; border: 1px solid rgba(124, 58, 237, 0.2); }

        /* Filter Controls Toolbar */
        .filter-section-card {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 14px;
          padding: 12px 18px;
          display: flex;
          gap: 12px;
          align-items: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
          flex-wrap: wrap;
          width: 100%;
          box-sizing: border-box;
        }
        .dark .filter-section-card {
          background: #1e293b;
          border-color: #334155;
        }

        .search-box-wrap {
          flex: 1;
          min-width: 240px;
          position: relative;
        }

        .search-icon-inside {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          color: #94A3B8;
        }

        .search-field {
          width: 100%;
          height: 36px;
          padding: 6px 12px 6px 34px;
          border: 1.5px solid #CBD5E1;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          outline: none;
          background: #FFFFFF;
          color: #0F172A;
          transition: all 0.15s ease;
          box-sizing: border-box;
        }
        .dark .search-field {
          background: #0f172a;
          border-color: #334155;
          color: #f8fafc;
        }
        .search-field:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #F8FAFC;
          border: 1.5px solid #CBD5E1;
          border-radius: 10px;
          padding: 2px 8px;
        }
        .dark .filter-group {
          background: #0f172a;
          border-color: #334155;
        }

        .filter-tag-label {
          font-size: 11.5px;
          font-weight: 800;
          color: #64748B;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .filter-select {
          height: 32px;
          padding: 2px 6px;
          border: none;
          background: transparent;
          font-size: 12.5px;
          font-weight: 750;
          color: #0F172A;
          outline: none;
          cursor: pointer;
        }
        .dark .filter-select {
          color: #f8fafc;
        }

        .btn-refresh-data {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1.5px solid #CBD5E1;
          background: #FFFFFF;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .dark .btn-refresh-data {
          background: #0f172a;
          border-color: #334155;
          color: #94a3b8;
        }
        .btn-refresh-data:hover {
          background: #F1F5F9;
          color: #0F172A;
          border-color: #94A3B8;
          transform: rotate(45deg);
        }

        /* High-Density Data Table Design */
        .table-container-card {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 16px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
          overflow: hidden;
          width: 100%;
          box-sizing: border-box;
        }
        .dark .table-container-card {
          background: #1e293b;
          border-color: #334155;
        }

        .table-top-bar {
          padding: 12px 18px;
          border-bottom: 1.5px solid #E2E8F0;
          background: #F8FAFC;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }
        .dark .table-top-bar {
          background: #0f172a;
          border-color: #334155;
        }

        .table-top-title {
          font-size: 13.5px;
          font-weight: 850;
          color: #1E293B;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dark .table-top-title {
          color: #f8fafc;
        }

        .table-scroll {
          width: 100%;
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .data-table th {
          background: #F8FAFC;
          padding: 12px 14px;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: #475569;
          border-bottom: 1.5px solid #E2E8F0;
          white-space: nowrap;
        }
        .dark .data-table th {
          background: #0f172a;
          color: #94a3b8;
          border-color: #334155;
        }

        .data-table td {
          padding: 12px 14px;
          font-size: 12.5px;
          color: #334155;
          border-bottom: 1px solid #F1F5F9;
          vertical-align: middle;
        }
        .dark .data-table td {
          border-color: #334155;
          color: #cbd5e1;
        }

        .data-table tbody tr:hover {
          background: #F8FAFC;
        }
        .dark .data-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .nowrap { white-space: nowrap; }
        .text-bold { font-weight: 800; color: #0F172A; }
        .dark .text-bold { color: #f8fafc; }
        .text-muted { color: #64748B; }
        .text-error { color: #DC2626; font-weight: 800; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }

        .btn-qc-action {
          padding: 5px 11px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 800;
          border: 1px solid transparent;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
          transition: all 0.15s ease;
        }

        .btn-qc-action.pending {
          background: #EFF6FF;
          color: #1D4ED8;
          border-color: #BFDBFE;
        }
        .btn-qc-action.pending:hover {
          background: #DBEAFE;
          transform: translateY(-1px);
        }

        .btn-qc-action.done-approved {
          background: #ECFDF5;
          color: #047857;
          border-color: #A7F3D0;
        }
        .btn-qc-action.done-approved:hover {
          background: #D1FAE5;
        }

        .btn-qc-action.done-rejected {
          background: #FEF2F2;
          color: #B91C1C;
          border-color: #FECACA;
        }
        .btn-qc-action.done-rejected:hover {
          background: #FEE2E2;
        }

        .btn-pdf-row {
          padding: 5px 10px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 800;
          background: #F1F5F9;
          color: #334155;
          border: 1.5px solid #CBD5E1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s ease;
        }
        .dark .btn-pdf-row {
          background: #0f172a;
          border-color: #334155;
          color: #f8fafc;
        }
        .btn-pdf-row:hover {
          background: #2563EB;
          color: #FFFFFF;
          border-color: #2563EB;
          transform: translateY(-1px);
        }

        .font-mono {
          font-family: 'JetBrains Mono', monospace;
        }

        /* Badges */
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 11px;
          border-radius: 9999px;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        /* ----------------------------------------------------
           MODAL SYSTEM - ULTRA PREMIUM EXECUTIVE DESIGN
        ---------------------------------------------------- */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.72);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px 16px;
          animation: modalFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .modal-card {
          background: #FFFFFF;
          border-radius: 20px;
          width: 100%;
          max-width: 820px;
          max-height: 90vh;
          overflow: hidden;
          box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(226, 232, 240, 0.8), 0 12px 30px -4px rgba(0, 0, 0, 0.12);
          border: 1px solid rgba(226, 232, 240, 0.9);
          display: flex;
          flex-direction: column;
          animation: modalSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .dark .modal-card {
          background: #0F172A;
          border-color: #1E293B;
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08);
        }

        .modal-header {
          padding: 18px 24px;
          background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 55%, #2563EB 100%);
          color: #FFFFFF;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 10;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
        }

        .modal-header-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
          color: #FDE047;
        }

        .modal-header-title {
          margin: 0;
          font-size: 17.5px;
          font-weight: 800;
          color: #FFFFFF;
          letter-spacing: -0.01em;
          line-height: 1.3;
        }

        .modal-header-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          flex-wrap: wrap;
        }

        .modal-meta-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11.5px;
          color: #E0E7FF;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 2px 10px;
          border-radius: 9999px;
          font-weight: 600;
        }

        .modal-close-btn {
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #FFFFFF;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
        }

        .modal-close-btn:hover {
          background: rgba(239, 68, 68, 0.85);
          border-color: rgba(239, 68, 68, 0.9);
          transform: scale(1.06);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .modal-body {
          padding: 22px 24px;
          overflow-y: auto;
          max-height: calc(90vh - 145px);
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: #FAFAFB;
        }
        .dark .modal-body {
          background: #0B1120;
        }

        /* Custom Scrollbar for Modal Body */
        .modal-body::-webkit-scrollbar {
          width: 7px;
        }
        .modal-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .modal-body::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 10px;
        }
        .dark .modal-body::-webkit-scrollbar-thumb {
          background: #334155;
        }

        /* Inspection Lot Summary Strip inside Modal */
        .modal-lot-banner {
          background: linear-gradient(135deg, #FFFFFF 0%, #F1F5F9 100%);
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          padding: 12px 18px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
        }
        .dark .modal-lot-banner {
          background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
          border-color: #334155;
          box-shadow: none;
        }

        .modal-lot-banner-item {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .modal-lot-banner-item span:first-child {
          color: #64748B;
          font-weight: 700;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .dark .modal-lot-banner-item span:first-child {
          color: #94A3B8;
        }

        .modal-lot-banner-item span:last-child {
          color: #0F172A;
          font-weight: 800;
          font-size: 13.5px;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dark .modal-lot-banner-item span:last-child {
          color: #F8FAFC;
        }

        /* Inspection Questions Form Cards */
        .qc-questions-grid {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .qc-row-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .qc-question-card {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 14px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .dark .qc-question-card {
          background: #1E293B;
          border-color: #334155;
          box-shadow: none;
        }

        .qc-question-card:hover {
          border-color: #60A5FA;
          box-shadow: 0 6px 18px -4px rgba(37, 99, 235, 0.12);
          transform: translateY(-1px);
        }
        .dark .qc-question-card:hover {
          border-color: #3B82F6;
          box-shadow: 0 6px 18px -4px rgba(0, 0, 0, 0.4);
        }

        .qc-question-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .qc-q-num-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .qc-q-badge {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
          color: #FFFFFF;
          font-weight: 800;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
        }

        .qc-q-title {
          font-weight: 800;
          font-size: 13.5px;
          color: #0F172A;
          line-height: 1.3;
        }
        .dark .qc-q-title {
          color: #F8FAFC;
        }

        .qc-q-subtitle {
          font-size: 12px;
          color: #64748B;
          margin: 0;
          line-height: 1.4;
          font-weight: 500;
        }
        .dark .qc-q-subtitle {
          color: #94A3B8;
        }

        /* Toggle Button Groups for Inspection */
        .toggle-btn-group {
          display: flex;
          gap: 10px;
          width: 100%;
        }

        .toggle-btn {
          flex: 1;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1.5px solid #CBD5E1;
          background: #F8FAFC;
          color: #475569;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .dark .toggle-btn {
          background: #0F172A;
          border-color: #334155;
          color: #CBD5E1;
        }

        .toggle-btn:hover {
          background: #F1F5F9;
          border-color: #94A3B8;
          color: #0F172A;
          transform: translateY(-1px);
        }
        .dark .toggle-btn:hover {
          background: #1E293B;
          color: #FFFFFF;
        }

        .toggle-btn.active-green {
          background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
          border-color: #10B981;
          color: #065F46;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.22), 0 0 0 1px #10B981;
        }
        .dark .toggle-btn.active-green {
          background: rgba(16, 185, 129, 0.18);
          border-color: #10B981;
          color: #34D399;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .toggle-btn.active-red {
          background: linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%);
          border-color: #EF4444;
          color: #991B1B;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.22), 0 0 0 1px #EF4444;
        }
        .dark .toggle-btn.active-red {
          background: rgba(239, 68, 68, 0.18);
          border-color: #EF4444;
          color: #F87171;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .qc-input-field {
          width: 100%;
          height: 42px;
          padding: 8px 14px;
          border: 1.5px solid #CBD5E1;
          border-radius: 10px;
          font-size: 13.5px;
          font-weight: 600;
          color: #0F172A;
          background: #FFFFFF;
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .dark .qc-input-field {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }

        .qc-input-field:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3.5px rgba(37, 99, 235, 0.15);
          background: #FFFFFF;
        }
        .dark .qc-input-field:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3.5px rgba(59, 130, 246, 0.2);
          background: #0F172A;
        }

        /* Final Decision Card & Verdict Buttons */
        .verdict-box {
          background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%);
          border: 2px solid #CBD5E1;
          border-radius: 16px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
        .dark .verdict-box {
          background: linear-gradient(135deg, #1E293B 0%, #111827 100%);
          border-color: #374151;
          box-shadow: none;
        }

        .verdict-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .verdict-title {
          font-weight: 800;
          font-size: 14.5px;
          color: #0F172A;
          letter-spacing: -0.01em;
        }
        .dark .verdict-title {
          color: #F8FAFC;
        }

        .verdict-sub {
          font-size: 12px;
          color: #64748B;
          font-weight: 600;
        }
        .dark .verdict-sub {
          color: #94A3B8;
        }

        .verdict-btn-group {
          display: flex;
          gap: 12px;
        }

        .verdict-btn {
          flex: 1;
          padding: 14px 18px;
          border-radius: 12px;
          border: 2px solid #CBD5E1;
          font-size: 13.5px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          background: #FFFFFF;
          color: #475569;
        }
        .dark .verdict-btn {
          background: #0F172A;
          border-color: #334155;
          color: #94A3B8;
        }

        .verdict-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .verdict-btn.pass {
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          border-color: #059669;
          color: #FFFFFF;
          box-shadow: 0 6px 18px rgba(16, 185, 129, 0.35);
        }
        .dark .verdict-btn.pass {
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          border-color: #10B981;
          color: #FFFFFF;
          box-shadow: 0 6px 18px rgba(16, 185, 129, 0.4);
        }

        .verdict-btn.fail {
          background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
          border-color: #DC2626;
          color: #FFFFFF;
          box-shadow: 0 6px 18px rgba(239, 68, 68, 0.35);
        }
        .dark .verdict-btn.fail {
          background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
          border-color: #EF4444;
          color: #FFFFFF;
          box-shadow: 0 6px 18px rgba(239, 68, 68, 0.4);
        }

        .qc-inspector-grid {
          display: grid;
          grid-template-columns: 1fr 1.6fr;
          gap: 14px;
          margin-top: 4px;
        }

        .qc-input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .qc-input-label {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
        }
        .dark .qc-input-label {
          color: #CBD5E1;
        }

        .qc-text-input {
          height: 40px;
          padding: 8px 14px;
          border: 1.5px solid #CBD5E1;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: #0F172A;
          background: #FFFFFF;
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .dark .qc-text-input {
          background: #0F172A;
          border-color: #334155;
          color: #F8FAFC;
        }

        .qc-text-input:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
        .dark .qc-text-input:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        /* Sticky Footer */
        .modal-footer-sticky {
          padding: 16px 24px;
          background: #FFFFFF;
          border-top: 1px solid #E2E8F0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          bottom: 0;
          z-index: 10;
          box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.03);
        }
        .dark .modal-footer-sticky {
          background: #0F172A;
          border-color: #1E293B;
          box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.3);
        }

        .btn-modal-cancel {
          padding: 10px 20px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          background: #F1F5F9;
          color: #475569;
          border: 1.5px solid #CBD5E1;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .dark .btn-modal-cancel {
          background: #1E293B;
          border-color: #334155;
          color: #CBD5E1;
        }
        .btn-modal-cancel:hover {
          background: #E2E8F0;
          color: #0F172A;
        }
        .dark .btn-modal-cancel:hover {
          background: #334155;
          color: #FFFFFF;
        }

        .btn-modal-submit {
          padding: 11px 24px;
          border-radius: 10px;
          font-size: 13.5px;
          font-weight: 800;
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
          color: #FFFFFF;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-modal-submit:hover:not(:disabled) {
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
          transform: translateY(-1px);
        }
        .btn-modal-submit:active:not(:disabled) {
          transform: translateY(0);
        }
        .btn-modal-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        /* Inspection Tips Guidelines Modal Styles */
        .tip-item-card {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 14px;
          padding: 14px 18px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          transition: all 0.2s ease;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
        }
        .dark .tip-item-card {
          background: #1E293B;
          border-color: #334155;
        }

        .tip-item-card:hover {
          border-color: #3B82F6;
          background: #EFF6FF;
          transform: translateX(3px);
        }
        .dark .tip-item-card:hover {
          background: rgba(30, 58, 138, 0.2);
          border-color: #3B82F6;
        }

        .tip-number-badge {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: linear-gradient(135deg, #1E40AF 0%, #2563EB 100%);
          color: #FFFFFF;
          font-weight: 800;
          font-size: 13.5px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 3px 8px rgba(30, 64, 175, 0.25);
        }

        .tip-info-wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .tip-header-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .tip-title-hindi {
          font-weight: 800;
          font-size: 13.5px;
          color: #0F172A;
          letter-spacing: 0.2px;
        }
        .dark .tip-title-hindi {
          color: #F8FAFC;
        }

        .tip-category-pill {
          font-size: 11px;
          font-weight: 700;
          background: #EEF2FF;
          color: #4338CA;
          padding: 2px 10px;
          border-radius: 9999px;
          border: 1px solid #C7D2FE;
        }
        .dark .tip-category-pill {
          background: rgba(99, 102, 241, 0.15);
          color: #A5B4FC;
          border-color: rgba(99, 102, 241, 0.3);
        }

        .tip-desc-english {
          margin: 0;
          font-size: 12.5px;
          color: #475569;
          line-height: 1.45;
        }
        .dark .tip-desc-english {
          color: #94A3B8;
        }

        .modal-footer-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: #64748B;
          font-weight: 600;
        }
        .dark .modal-footer-brand {
          color: #94A3B8;
        }

        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { transform: translateY(24px) scale(0.97); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }

        @media (max-width: 1024px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .modal-lot-banner { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 768px) {
          .qc-row-2col { grid-template-columns: 1fr; }
          .qc-inspector-grid { grid-template-columns: 1fr; }
          .verdict-btn-group { flex-direction: column; }
          .modal-lot-banner { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="report-container">
        {/* Top Header Card */}
        <div className="report-header-card">
          <div className="header-title-wrap">
            <button className="btn-back-link" onClick={() => navigate('/')}>
              <ArrowLeft size={13} /> Back
            </button>
            <div className="header-icon-box">
              <Layers size={22} />
            </div>
            <div className="header-title-text">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '2px 10px 2px 4px',
                  borderRadius: '20px',
                  border: '1.5px solid #0F172A',
                  background: '#FFFFFF',
                  color: '#0F172A'
                }}>
                  <span style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: '1.5px solid #0F172A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '11px',
                    color: '#0F172A'
                  }}>
                    5
                  </span>
                  <span style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                    5th Report · Quality Control
                  </span>
                </div>
              </div>
              <h1>
                <span>Dyeing Shortage & Quality Audit</span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: '#F1F5F9',
                  color: '#334155',
                  border: '1px solid #CBD5E1'
                }}>
                  {processedData.length} submissions
                </span>
              </h1>
              <p>Fabric roll variance, dye house weight losses & physical quality audits</p>
            </div>
          </div>

          <div className="header-btn-group">
            {/* FABRIC INSPECTION TIPS GUIDELINES BUTTON */}
            <button
              type="button"
              className="btn-tips"
              onClick={() => setShowTipsModal(true)}
              title="View Fabric Inspection Checklist Guidelines"
            >
              <Lightbulb size={17} />
              <span>Fabric Inspection Tips</span>
            </button>

            <button className="btn btn-primary" onClick={() => navigate('/shortage-report-form')}>
              <Plus size={15} /> Log Shortage Form
            </button>

            <button className="btn btn-secondary" onClick={handlePrint}>
              <Printer size={15} /> Print
            </button>

            <button className="btn btn-secondary" onClick={handleExport} disabled={!processedData.length}>
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center flex flex-col items-center gap-3 shadow-sm">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500 font-medium text-sm">Loading shortage database records...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 rounded-xl border border-red-200 p-8 text-center flex flex-col items-center gap-2">
            <AlertTriangle size={32} className="text-red-500" />
            <h3 className="text-red-900 font-bold text-base m-0">Error Loading Shortage Reports</h3>
            <p className="text-red-700 text-sm m-0">{error}</p>
            <button className="btn btn-primary mt-2" onClick={fetchReport}>Retry Load</button>
          </div>
        ) : (
          <>
            {/* 5-Column Stock Tracking KPI Cards Grid */}
            <div className="kpi-grid">
              <div className="kpi-card sent">
                <div className="kpi-data-block">
                  <span className="kpi-label">Total Issued / Sent</span>
                  <span className="kpi-value">{metrics.totalSentWeight.toFixed(2)} kg</span>
                  <span className="kpi-sub">Total dispatched to Processors</span>
                </div>
                <div className="kpi-icon-pill">
                  <Scale size={22} />
                </div>
              </div>

              <div className="kpi-card sent" style={{ borderTopColor: '#6366F1' }}>
                <div className="kpi-data-block">
                  <span className="kpi-label">Total Billed Weight</span>
                  <span className="kpi-value" style={{ color: '#4338CA' }}>{metrics.totalBilledWeight.toFixed(2)} kg</span>
                  <span className="kpi-sub">Total billed against challans</span>
                </div>
                <div className="kpi-icon-pill" style={{ background: '#EEF2FF', color: '#6366F1' }}>
                  <Receipt size={22} />
                </div>
              </div>

              <div className="kpi-card received">
                <div className="kpi-data-block">
                  <span className="kpi-label">Total Received Weight</span>
                  <span className="kpi-value">{metrics.totalReceivedWeight.toFixed(2)} kg</span>
                  <span className="kpi-sub">Verified received & weighed</span>
                </div>
                <div className="kpi-icon-pill">
                  <CheckCircle2 size={22} />
                </div>
              </div>

              <div className="kpi-card shortage">
                <div className="kpi-data-block">
                  <span className="kpi-label">Total Bill Shortage</span>
                  <span className="kpi-value text-error">{metrics.totalWeightShortage.toFixed(2)} kg</span>
                  <span className="kpi-sub">Rate: {metrics.overallShortagePct}% | Rejects: {metrics.rejectCount}</span>
                </div>
                <div className="kpi-icon-pill">
                  <AlertTriangle size={22} />
                </div>
              </div>

              <div className="kpi-card pending-stock">
                <div className="kpi-data-block">
                  <span className="kpi-label">Pending at Mill (Stock)</span>
                  <span className="kpi-value" style={{ color: '#7C3AED' }}>{metrics.totalPendingAtMill.toFixed(2)} kg</span>
                  <span className="kpi-sub">Balance in {metrics.case3Count} partial lots</span>
                </div>
                <div className="kpi-icon-pill">
                  <Boxes size={22} />
                </div>
              </div>
            </div>

            {/* Filter Section with Scenario & Status Filters */}
            <div className="filter-section-card">
              <div className="search-box-wrap">
                <Search size={16} className="search-icon-inside" />
                <input
                  type="text"
                  className="search-field"
                  placeholder="Search lot no, bill no, processor, fabric description, shade, reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <span className="filter-tag-label"><ListFilter size={14} /> Scenario:</span>
                <select
                  className="filter-select font-medium"
                  value={scenarioFilter}
                  onChange={(e) => setScenarioFilter(e.target.value)}
                >
                  <option value="All">All Scenarios ({reportData.length})</option>
                  <option value="Case1">Case 1: Full & Equal (0% Loss)</option>
                  <option value="Case2">Case 2: Process Shortage</option>
                  <option value="Case3">Case 3: Partial Bill (Balance at Mill)</option>
                </select>
              </div>

              <div className="filter-group">
                <span className="filter-tag-label"><SlidersHorizontal size={14} /> Status:</span>
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses ({reportData.length})</option>
                  <option value="Approved">Approved (≤ 10%)</option>
                  <option value="Reject">Reject (&gt; 10%)</option>
                </select>
              </div>

              <div className="filter-group">
                <span className="filter-tag-label"><ArrowUpDown size={14} /> Sort:</span>
                <select
                  className="filter-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="newest">Newest First</option>
                  <option value="pendingStockDesc">Pending Stock (High to Low)</option>
                  <option value="shortagePctDesc">Shortage % (High to Low)</option>
                  <option value="shortagePctAsc">Shortage % (Low to High)</option>
                  <option value="lotNumberAsc">Lot Number (A-Z)</option>
                  <option value="sentWeightDesc">Issued Weight (High to Low)</option>
                  <option value="weightDiffDesc">Shortage Weight (High to Low)</option>
                </select>
              </div>

              <button className="btn-refresh-data" onClick={fetchReport} title="Refresh Data">
                <RefreshCw size={15} />
              </button>
            </div>

            {/* Comparison Table Card */}
            <div className="table-container-card">
              <div className="table-top-bar">
                <div className="table-top-title flex items-center gap-2">
                  <span>Logged Shortage Reports ({processedData.length} matching)</span>
                  {metrics.totalPendingAtMill > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                      📦 Total Pending Stock at Mill: {metrics.totalPendingAtMill.toFixed(2)} kg
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#64748B' }}>
                  QC Verified: <span className="text-emerald-700 font-bold">{metrics.inspectedCount}</span> / Shortage Rejections: <span className="text-error font-bold">{metrics.rejectCount}</span>
                </div>
              </div>

              {processedData.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center gap-3">
                  <CheckCircle2 size={36} className="text-emerald-500" />
                  <h3 className="m-0 text-base font-bold text-slate-800">No Records Found</h3>
                  <p className="m-0 text-sm text-slate-500">All records match your filter criteria.</p>
                  <button className="btn btn-primary mt-2" onClick={() => navigate('/shortage-report-form')}>
                    <Plus size={15} /> Open Shortage Report Form
                  </button>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '45px' }}>#</th>
                        <th>Bill No.</th>
                        <th>Lot No.</th>
                        <th>Job Order</th>
                        <th>Processor / Mill</th>
                        <th>Fabric Description</th>
                        <th>Shade</th>
                        <th className="text-right">Issued Wt (Rolls)</th>
                        <th className="text-right">Billed Wt</th>
                        <th className="text-right">Recd Wt (Rolls)</th>
                        <th className="text-right">Bill Shortage</th>
                        <th className="text-center">Pending at Mill</th>
                        <th style={{ textAlign: 'center' }}>Stock Scenario</th>
                        <th style={{ textAlign: 'center' }}>Final Inspection</th>
                        <th style={{ textAlign: 'center', width: '70px' }}>PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processedData.map((r, idx) => (
                        <tr key={r.id || idx}>
                          <td className="font-mono font-bold text-xs text-blue-600">
                            #{r.dbId || idx + 1}
                          </td>
                          <td className="font-mono font-semibold nowrap">{r.billNumber}</td>
                          <td className="text-bold font-mono nowrap">{r.lotNumber}</td>
                          <td className="text-xs font-semibold nowrap">{r.jobOrderNo || '—'}</td>
                          <td className="font-medium text-xs">{r.cmfParty || r.brand}</td>
                          <td>
                            <div className="font-semibold text-xs text-slate-900">{r.fabric}</div>
                            {r.reason && (
                              <div className="text-[11px] text-amber-700 font-medium leading-tight mt-0.5">
                                {r.reason}
                              </div>
                            )}
                          </td>
                          <td className="nowrap text-xs">{r.sentShade}</td>

                          {/* ISSUED WEIGHT & ROLLS */}
                          <td className="text-right nowrap">
                            <span className="text-bold font-mono">{r.sentWeight.toFixed(2)}</span> <span className="text-xs text-muted">{r.unit}</span>
                            <br />
                            <span className="text-muted font-mono text-[11px]">({r.sentRolls} rolls)</span>
                          </td>

                          {/* BILLED WEIGHT */}
                          <td className="text-right nowrap">
                            <span className="font-extrabold font-mono text-slate-800" style={{ fontSize: '13px' }}>
                              {r.billedQty.toFixed(2)}
                            </span> <span className="text-xs text-muted">{r.unit}</span>
                          </td>

                          {/* RECD WEIGHT & ROLLS */}
                          <td className="text-right nowrap">
                            <span className="text-bold font-mono">{r.receivedWeight.toFixed(2)}</span> <span className="text-xs text-muted">{r.unit}</span>
                            <br />
                            <span className="text-muted font-mono text-[11px]">({r.receivedRolls} rolls)</span>
                          </td>

                          {/* BILL SHORTAGE */}
                          <td className="text-right nowrap">
                            {r.weightDiff > 0 ? (
                              <>
                                <span className="text-error font-bold font-mono text-xs">{r.weightDiff.toFixed(2)} {r.unit}</span>
                                <br />
                                <span className="text-error font-mono text-[11px] font-bold">({r.shortagePct}%)</span>
                              </>
                            ) : (
                              <span className="text-emerald-700 font-mono text-xs font-bold">0.00 {r.unit} (0%)</span>
                            )}
                          </td>

                          {/* PENDING STOCK WITH MILL */}
                          <td style={{ textAlign: 'center' }} className="nowrap">
                            {r.pendingStock > 0 ? (
                              <span className="px-2.5 py-1 bg-purple-50 text-purple-800 border border-purple-200 rounded-md font-mono font-bold text-xs inline-block">
                                +{r.pendingStock.toFixed(2)} {r.unit}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">—</span>
                            )}
                          </td>

                          {/* STOCK AUDIT SCENARIO BADGE */}
                          <td style={{ textAlign: 'center' }}>
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold border ${r.scenarioBadge}`}>
                                {r.scenarioTitle}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium">
                                {r.scenarioDesc}
                              </span>
                            </div>
                          </td>

                          {/* FINAL INSPECTION CHECKLIST DIALOG BUTTON */}
                          <td style={{ textAlign: 'center' }}>
                            {r.inspectionDetails && r.inspectionDetails.overallVerdict ? (
                              <button
                                type="button"
                                onClick={() => handleOpenInspection(r)}
                                className={`btn-qc-action ${r.inspectionDetails.overallVerdict === 'REJECTED' ? 'done-rejected' : 'done-approved'}`}
                                title="Click to View or Edit Inspection Details"
                              >
                                {r.inspectionDetails.overallVerdict === 'REJECTED' ? (
                                  <>
                                    <AlertTriangle size={13} />
                                    <span>QC Reject</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={13} />
                                    <span>QC Pass</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenInspection(r)}
                                className="btn-qc-action pending"
                                title="Click to Fill Final Inspection Checklist"
                              >
                                <ClipboardCheck size={13} />
                                <span>Do Inspection</span>
                              </button>
                            )}
                          </td>

                          {/* DOWNLOAD COMPOSITE PDF */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleDownloadPdf(r)}
                              className="btn-pdf-row"
                              title={`Download Audit PDF for Lot ${r.lotNumber}`}
                            >
                              <FileDown size={13} />
                              <span>PDF</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 1. FABRIC INSPECTION TIPS GUIDELINE MODAL */}
      {showTipsModal && (
        <div className="modal-overlay" onClick={() => setShowTipsModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-3">
                <div className="modal-header-icon-box">
                  <Lightbulb size={22} />
                </div>
                <div>
                  <h2 className="modal-header-title">Fabric Inspection Tips (कपड़ा जांच दिशानिर्देश)</h2>
                  <div className="modal-header-meta">
                    <span className="modal-meta-pill">Standard Quality Control & Inspection Checklist</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowTipsModal(false)}
                title="Close Guidelines"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {inspectionTips.map((tip) => {
                return (
                  <div key={tip.id} className="tip-item-card">
                    <div className="tip-number-badge">
                      {tip.id}
                    </div>
                    <div className="tip-info-wrap">
                      <div className="tip-header-line">
                        <span className="tip-title-hindi">{tip.title}</span>
                        <span className="tip-category-pill">{tip.tag}</span>
                      </div>
                      <p className="tip-desc-english">{tip.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-footer-sticky">
              <div className="modal-footer-brand">
                <ShieldCheck size={18} color="#059669" />
                <span>Mohit Hosiery Quality Assurance Standards</span>
              </div>
              <button
                type="button"
                className="btn-modal-submit"
                onClick={() => setShowTipsModal(false)}
              >
                Close Guidelines
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. PER-LOT FINAL QUALITY INSPECTION DIALOG BOX */}
      {selectedInspectionRecord && (
        <div className="modal-overlay" onClick={() => !savingInspection && setSelectedInspectionRecord(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div className="flex items-center gap-3">
                <div className="modal-header-icon-box">
                  <ClipboardCheck size={24} />
                </div>
                <div>
                  <h2 className="modal-header-title">
                    Final Fabric Inspection Form (अंतिम कपड़ा जांच)
                  </h2>
                  <div className="modal-header-meta">
                    <span className="modal-meta-pill">
                      Lot No: <b className="text-white font-mono">{selectedInspectionRecord.lotNumber}</b>
                    </span>
                    <span className="modal-meta-pill">
                      Bill: <b className="text-white">{selectedInspectionRecord.billNumber}</b>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !savingInspection && setSelectedInspectionRecord(null)}
                title="Close Form"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveInspection}>
              <div className="modal-body">
                {/* Lot info strip */}
                <div className="modal-lot-banner">
                  <div className="modal-lot-banner-item">
                    <span>Lot Number</span>
                    <span>{selectedInspectionRecord.lotNumber}</span>
                  </div>
                  <div className="modal-lot-banner-item">
                    <span>Fabric Name</span>
                    <span>{selectedInspectionRecord.fabric}</span>
                  </div>
                  <div className="modal-lot-banner-item">
                    <span>Shade / Color</span>
                    <span>{selectedInspectionRecord.sentShade}</span>
                  </div>
                  <div className="modal-lot-banner-item">
                    <span>Processor / Mill</span>
                    <span>{selectedInspectionRecord.cmfParty}</span>
                  </div>
                </div>

                <div className="qc-questions-grid">
                  {/* 1. FABRIC SAAF HAI YA NHI */}
                  <div className="qc-question-card">
                    <div className="qc-question-header">
                      <div className="qc-q-num-title">
                        <span className="qc-q-badge">1</span>
                        <span className="qc-q-title">FABRIC SAAF HAI YA NHI? (Fabric Cleanliness)</span>
                      </div>
                    </div>
                    <p className="qc-q-subtitle">Ensure no dust, grease, stain spots or weaving dirt patches.</p>
                    <div className="toggle-btn-group">
                      <button
                        type="button"
                        className={`toggle-btn ${inspectionForm.fabricClean === 'YES' ? 'active-green' : ''}`}
                        onClick={() => setInspectionForm({ ...inspectionForm, fabricClean: 'YES' })}
                      >
                        <Check size={15} /> Haan, Saaf Hai (Clean - YES)
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${inspectionForm.fabricClean === 'NO' ? 'active-red' : ''}`}
                        onClick={() => setInspectionForm({ ...inspectionForm, fabricClean: 'NO' })}
                      >
                        <X size={15} /> Nahi, Daag / Ganda Hai (Dirty - NO)
                      </button>
                    </div>
                  </div>

                  {/* 2. FABRIC KI HAND FEEL THIK HAI YA NHI */}
                  <div className="qc-question-card">
                    <div className="qc-question-header">
                      <div className="qc-q-num-title">
                        <span className="qc-q-badge">2</span>
                        <span className="qc-q-title">FABRIC KI HAND FEEL THIK HAI YA NHI? (Hand Feel)</span>
                      </div>
                    </div>
                    <p className="qc-q-subtitle">Verify softness, finish, and touch quality standard.</p>
                    <div className="toggle-btn-group">
                      <button
                        type="button"
                        className={`toggle-btn ${inspectionForm.fabricHandFeel === 'OK' ? 'active-green' : ''}`}
                        onClick={() => setInspectionForm({ ...inspectionForm, fabricHandFeel: 'OK' })}
                      >
                        <Check size={15} /> Theek Hai / Soft (OK)
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${inspectionForm.fabricHandFeel === 'NOT_OK' ? 'active-red' : ''}`}
                        onClick={() => setInspectionForm({ ...inspectionForm, fabricHandFeel: 'NOT_OK' })}
                      >
                        <X size={15} /> Rough / Kharab Hai (Not OK)
                      </button>
                    </div>
                  </div>

                  {/* 3 & 4. READY DIA & READY GSM SIDE BY SIDE */}
                  <div className="qc-row-2col">
                    {/* 3. READY DIA KITNA HAI */}
                    <div className="qc-question-card">
                      <div className="qc-question-header">
                        <div className="qc-q-num-title">
                          <span className="qc-q-badge">3</span>
                          <span className="qc-q-title">READY DIA KITNA HAI? (Width / DIA)</span>
                        </div>
                      </div>
                      <p className="qc-q-subtitle">Measured finished fabric tube or open width.</p>
                      <input
                        type="text"
                        required
                        className="qc-input-field"
                        placeholder="e.g. 60 inches / 152 cm"
                        value={inspectionForm.readyDia}
                        onChange={(e) => setInspectionForm({ ...inspectionForm, readyDia: e.target.value })}
                      />
                    </div>

                    {/* 4. READY GSM KITNA HAI */}
                    <div className="qc-question-card">
                      <div className="qc-question-header">
                        <div className="qc-q-num-title">
                          <span className="qc-q-badge">4</span>
                          <span className="qc-q-title">READY GSM KITNA HAI? (GSM)</span>
                        </div>
                      </div>
                      <p className="qc-q-subtitle">Measured GSM from sample disc cut.</p>
                      <input
                        type="text"
                        required
                        className="qc-input-field"
                        placeholder="e.g. 280 GSM / 320 GSM"
                        value={inspectionForm.readyGsm}
                        onChange={(e) => setInspectionForm({ ...inspectionForm, readyGsm: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* 5. RIB KA DIA KITNA HAI */}
                  <div className="qc-question-card">
                    <div className="qc-question-header">
                      <div className="qc-q-num-title">
                        <span className="qc-q-badge">5</span>
                        <span className="qc-q-title">RIB KA DIA KITNA HAI? (RIB Diameter / Width)</span>
                      </div>
                    </div>
                    <p className="qc-q-subtitle">Enter RIB width or tubular diameter.</p>
                    <input
                      type="text"
                      required
                      className="qc-input-field"
                      placeholder="e.g. 18 inches tubular / 20 inches"
                      value={inspectionForm.ribDia}
                      onChange={(e) => setInspectionForm({ ...inspectionForm, ribDia: e.target.value })}
                    />
                  </div>

                  {/* 6. RIB SAAF HAI YA NHI */}
                  <div className="qc-question-card">
                    <div className="qc-question-header">
                      <div className="qc-q-num-title">
                        <span className="qc-q-badge">6</span>
                        <span className="qc-q-title">RIB SAAF HAI YA NHI? (RIB Cleanliness)</span>
                      </div>
                    </div>
                    <p className="qc-q-subtitle">Verify RIB roll is free of lint, oil, and grease patches.</p>
                    <div className="toggle-btn-group">
                      <button
                        type="button"
                        className={`toggle-btn ${inspectionForm.ribClean === 'YES' ? 'active-green' : ''}`}
                        onClick={() => setInspectionForm({ ...inspectionForm, ribClean: 'YES' })}
                      >
                        <Check size={15} /> Haan, RIB Saaf Hai (YES)
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${inspectionForm.ribClean === 'NO' ? 'active-red' : ''}`}
                        onClick={() => setInspectionForm({ ...inspectionForm, ribClean: 'NO' })}
                      >
                        <X size={15} /> Nahi, Daag / Lint Hai (NO)
                      </button>
                    </div>
                  </div>

                  {/* 7. KAPDA S RIB KI MATCHING OK HAI YA NHI */}
                  <div className="qc-question-card">
                    <div className="qc-question-header">
                      <div className="qc-q-num-title">
                        <span className="qc-q-badge">7</span>
                        <span className="qc-q-title">KAPDA S RIB KI MATCHING OK HAI YA NHI? (Shade Match)</span>
                      </div>
                    </div>
                    <p className="qc-q-subtitle">Compare color tone and shade matching between Main Fabric & RIB.</p>
                    <div className="toggle-btn-group">
                      <button
                        type="button"
                        className={`toggle-btn ${inspectionForm.ribMatching === 'OK' ? 'active-green' : ''}`}
                        onClick={() => setInspectionForm({ ...inspectionForm, ribMatching: 'OK' })}
                      >
                        <Check size={15} /> 100% Matching OK Hai (Match)
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${inspectionForm.ribMatching === 'MISMATCH' ? 'active-red' : ''}`}
                        onClick={() => setInspectionForm({ ...inspectionForm, ribMatching: 'MISMATCH' })}
                      >
                        <X size={15} /> Color / Shade Variation Hai (Mismatch)
                      </button>
                    </div>
                  </div>
                </div>

                {/* OVERALL INSPECTION VERDICT & REMARKS */}
                <div className="verdict-box">
                  <div className="verdict-header">
                    <span className="verdict-title">
                      FINAL QC VERDICT (अंतिम निर्णय)
                    </span>
                    <span className="verdict-sub">Mandatory Approval Decision</span>
                  </div>

                  <div className="verdict-btn-group">
                    <button
                      type="button"
                      className={`verdict-btn ${inspectionForm.overallVerdict === 'APPROVED' ? 'pass' : ''}`}
                      onClick={() => setInspectionForm({ ...inspectionForm, overallVerdict: 'APPROVED' })}
                    >
                      <CheckCircle2 size={19} />
                      <span>APPROVED FOR PRODUCTION (पास)</span>
                    </button>

                    <button
                      type="button"
                      className={`verdict-btn ${inspectionForm.overallVerdict === 'REJECTED' ? 'fail' : ''}`}
                      onClick={() => setInspectionForm({ ...inspectionForm, overallVerdict: 'REJECTED' })}
                    >
                      <AlertTriangle size={19} />
                      <span>REJECT / HOLD LOT (फेल / रोकें)</span>
                    </button>
                  </div>

                  <div className="qc-inspector-grid">
                    <div className="qc-input-group">
                      <label className="qc-input-label">Inspected By (जांचकर्ता)</label>
                      <input
                        type="text"
                        className="qc-text-input"
                        value={inspectionForm.inspectedBy}
                        onChange={(e) => setInspectionForm({ ...inspectionForm, inspectedBy: e.target.value })}
                        placeholder="Inspector name"
                      />
                    </div>
                    <div className="qc-input-group">
                      <label className="qc-input-label">Remarks / Note</label>
                      <input
                        type="text"
                        className="qc-text-input"
                        value={inspectionForm.remarks}
                        onChange={(e) => setInspectionForm({ ...inspectionForm, remarks: e.target.value })}
                        placeholder="e.g. Minor rib variation but within tolerance"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="modal-footer-sticky">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setSelectedInspectionRecord(null)}
                  disabled={savingInspection}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-modal-submit"
                  disabled={savingInspection}
                >
                  {savingInspection ? (
                    <span>Saving Inspection...</span>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save & Complete Final Inspection</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
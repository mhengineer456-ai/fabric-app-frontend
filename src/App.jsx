import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import Materials from './pages/Materials.jsx';
import WarehousePage from './pages/WarehousePage.jsx';
import GRNPage from './pages/GRNPage.jsx';
import IssuePage from './pages/IssuePage.jsx';
import TransferPage from './pages/TransferPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import FabricStickerForm from './pages/FabricStickerForm.jsx';
import Recommandation from './pages/Recommandation.jsx';
import DyeingMaterialForm from './pages/DyeingMaterialForm.jsx';
import DyeingMaterialManual from './pages/DyeingMaterialManual.jsx';
import Parta from './pages/Parta.jsx';
import FabricReceivingHistoryPage from './pages/FabricReceivingHistoryPage.jsx';
import PartaPendingPage from './pages/PartaPendingPage.jsx';
import OldInventory from './pages/OldInventory.jsx';
import JobOrder from './pages/JobOrder.jsx';
import FabricStockMtr from './pages/FabricStockMtr.jsx';
import FabricStockkgs from './pages/FabricStockkgs.jsx';
import MaterialAgainstPoForm from './pages/MaterialAgainstPoForm.jsx';
import FabricPoAudit from './pages/FabricPoAudit.jsx';
import ReAddMaterialForm from './pages/ReAddMaterialForm.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import ApprovalPanelPage from './pages/ApprovalPanelPage.jsx';



import DailyInventoryQuantity from './pages/DailyInventoryQuantity.jsx';
import SupervisorWiseReport from './pages/SupervisorWiseReport.jsx';
import LocationWiseReport from './pages/LocationWiseReport.jsx';
import DailyFabricIssueReport from './pages/DailyFabricIssueReport.jsx';
import DyeingShortageReport from './pages/report.jsx';
import CutterMasterWiseReport from './pages/CutterMasterWiseReport.jsx';
import DailyCuttingReport from './pages/DailyCuttingReport.jsx';
import HallWiseCuttingReport from './pages/HallWiseCuttingReport.jsx';
import TableWiseClassification from './pages/TableWiseClassification.jsx';
import ShortageReportForm from './pages/ShortageReportForm.jsx';
import SoftwareGuidePage from './pages/SoftwareGuidePage.jsx';
import MDReportsHub from './pages/MDReportsHub.jsx';



export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('twms_dark') === 'true';
  });

  const [showSplash, setShowSplash] = useState(true);
  const [fadeSplash, setFadeSplash] = useState(false);

  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem('twms_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Start fading out after 1800ms
    const fadeTimer = setTimeout(() => {
      setFadeSplash(true);
    }, 1800);

    // Completely remove after 2200ms
    const removeTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2200);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('twms_dark', darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDark = () => setDarkMode(d => !d);

  const handleLogout = () => {
    localStorage.removeItem('twms_token');
    localStorage.removeItem('twms_user');
    setUser(null);
  };

  return (
    <>
      {showSplash && (
        <div className={`splash-screen ${fadeSplash ? 'fade-out' : ''}`}>
          <div className="splash-logo-container">
            <div className="splash-logo-circle-1"></div>
            <div className="splash-logo-circle-2"></div>
            <div className="splash-logo-badge">TWMS</div>
          </div>
          <h1 className="splash-title">TEXTILE WAREHOUSE</h1>
          <p className="splash-subtitle">Management System</p>

          <div className="splash-progress-track">
            <div className="splash-progress-fill"></div>
          </div>

          <div className="splash-footer">Optimizing Fabric Storage & Production Flow...</div>

          <style>{`
            .splash-screen {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              background: radial-gradient(circle at center, #1e3c72 0%, #0f172a 100%);
              z-index: 999999;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: white;
              font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
              transition: opacity 0.4s ease, visibility 0.4s ease;
            }

            .splash-screen.fade-out {
              opacity: 0;
              visibility: hidden;
            }

            .splash-logo-container {
              position: relative;
              width: 120px;
              height: 120px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 24px;
            }

            .splash-logo-circle-1 {
              position: absolute;
              width: 100%;
              height: 100%;
              border: 2px dashed rgba(255, 255, 255, 0.15);
              border-radius: 50%;
              animation: spin-clockwise 10s linear infinite;
            }

            .splash-logo-circle-2 {
              position: absolute;
              width: 80%;
              height: 80%;
              border: 2px solid rgba(96, 165, 250, 0.3);
              border-radius: 50%;
              animation: spin-counter-clockwise 6s linear infinite;
            }

            .splash-logo-badge {
              width: 70px;
              height: 70px;
              background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
              border-radius: 20px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 20px;
              letter-spacing: 1px;
              box-shadow: 0 0 30px rgba(124, 58, 237, 0.4);
              z-index: 2;
              animation: pulse-glow 2s ease-in-out infinite;
            }

            .splash-title {
              font-size: 28px;
              font-weight: 900;
              letter-spacing: 4px;
              margin: 0;
              text-align: center;
              background: linear-gradient(to right, #ffffff, #93c5fd);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }

            .splash-subtitle {
              font-size: 13px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 6px;
              color: #93c5fd;
              margin: 6px 0 36px 0;
              opacity: 0.8;
            }

            .splash-progress-track {
              width: 200px;
              height: 4px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 2px;
              overflow: hidden;
              margin-bottom: 24px;
            }

            .splash-progress-fill {
              height: 100%;
              width: 0%;
              background: linear-gradient(90deg, #2563eb, #7c3aed);
              border-radius: 2px;
              animation: progress-load 1.8s ease-in-out forwards;
            }

            .splash-footer {
              font-size: 11px;
              color: rgba(255, 255, 255, 0.4);
              letter-spacing: 0.5px;
              position: absolute;
              bottom: 30px;
              animation: fade-in-out 2s infinite;
            }

            @keyframes spin-clockwise {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }

            @keyframes spin-counter-clockwise {
              0% { transform: rotate(360deg); }
              100% { transform: rotate(0deg); }
            }

            @keyframes pulse-glow {
              0%, 100% { transform: scale(1); box-shadow: 0 0 25px rgba(124, 58, 237, 0.4); }
              50% { transform: scale(1.05); box-shadow: 0 0 40px rgba(124, 58, 237, 0.6); }
            }

            @keyframes progress-load {
              0% { width: 0%; }
              30% { width: 40%; }
              70% { width: 85%; }
              100% { width: 100%; }
            }

            @keyframes fade-in-out {
              0%, 100% { opacity: 0.5; }
              50% { opacity: 0.9; }
            }
          `}</style>
        </div>
      )}
      <BrowserRouter>
        {user ? (
          <Layout darkMode={darkMode} toggleDark={toggleDark} currentUser={user} handleLogout={handleLogout}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/materials" element={<Materials />} />
              <Route path="/fabric-sticker" element={<FabricStickerForm />} />
              <Route path="/dyeing-material" element={<DyeingMaterialForm />} />
              <Route path="/dyeing-material-manual" element={<DyeingMaterialManual />} />
              <Route path="/dyeing-manual" element={<DyeingMaterialManual />} />
              <Route path="/warehouse" element={<WarehousePage />} />
              <Route path="/grn" element={<GRNPage />} />
              <Route path="/issue" element={<IssuePage />} />
              <Route path="/transfer" element={<TransferPage />} />
              <Route path="/parta" element={<Parta />} />
              <Route path="/fabric-receiving-history" element={<FabricReceivingHistoryPage />} />
              <Route path="/recommendation" element={<Recommandation />} />
              <Route path="/old-inventory" element={<OldInventory />} />
              <Route path="/job-orders" element={<JobOrder />} />
              <Route path="/fabric-stock" element={<FabricStockMtr />} />
              <Route path="/fabric-stock-kgs" element={<FabricStockkgs />} />
              <Route path="/material-against-po" element={<MaterialAgainstPoForm />} />
              <Route path="/fabric-po-audit" element={<FabricPoAudit />} />
              <Route path="/re-add-material" element={<ReAddMaterialForm />} />
              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/approvals" element={<ApprovalPanelPage />} />
              <Route path="/shortage-report-form" element={<ShortageReportForm />} />
              <Route path="/software-guide" element={<SoftwareGuidePage />} />
              <Route path="/md-reports" element={<MDReportsHub />} />
              <Route path="/executive-reports" element={<MDReportsHub />} />



              <Route path="/reports/daily-inventory/quantity-wise" element={<DailyInventoryQuantity />} />
              <Route path="/reports/daily-cutting-report" element={<DailyCuttingReport />} />
              <Route path="/reports/daily-cutting/cutter-master" element={<CutterMasterWiseReport />} />
              <Route path="/reports/daily-cutting/supervisor" element={<SupervisorWiseReport />} />
              <Route path="/reports/daily-cutting/location" element={<LocationWiseReport />} />
              <Route path="/reports/daily-cutting/hall" element={<HallWiseCuttingReport />} />
              <Route path="/reports/daily-fabric-issue" element={<DailyFabricIssueReport />} />
              <Route path="/reports/dyeing-shortage" element={<DyeingShortageReport />} />
              <Route path="/reports/table-wise-classification" element={<TableWiseClassification />} />
              {user?.role !== 'Admin' && (
                <Route path="/parta-pending" element={<PartaPendingPage />} />
              )}
              {user?.role === 'Admin' && (
                <>
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/reports/stock" element={<ReportsPage />} />
                  <Route path="/reports/warehouse" element={<ReportsPage />} />
                  <Route path="/reports/movement" element={<ReportsPage />} />
                  <Route path="/reports/supplier" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage darkMode={darkMode} toggleDark={toggleDark} />} />
                </>
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        ) : (
          <Routes>
            <Route path="/login" element={<LoginPage setUser={setUser} />} />
            <Route path="/register" element={<RegisterPage setUser={setUser} />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        )}
      </BrowserRouter>
    </>
  );
}


import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider } from './context/ConfirmContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Laboratories from './pages/Laboratories';
import LaboratoryDetail from './pages/LaboratoryDetail';
import LabStockCards from './pages/LabStockCards';
import StockCard from './pages/StockCard';
import LabEquipment from './pages/LabEquipment';
import EquipmentMonitoringRecord from './pages/EquipmentMonitoringRecord';
import MaintenanceSchedule from './pages/MaintenanceSchedule';
import CalibrationSchedule from './pages/CalibrationSchedule';
import LabWorkRequests from './pages/LabWorkRequests';
import NewWorkRequest from './pages/NewWorkRequest';
import WorkRequestDetail from './pages/WorkRequestDetail';
import WorkRequestsInbox from './pages/WorkRequestsInbox';
import LabBorrowingRequests from './pages/LabBorrowingRequests';
import NewBorrowingRequest from './pages/NewBorrowingRequest';
import BorrowingRequestDetail from './pages/BorrowingRequestDetail';
import BorrowingRequestsInbox from './pages/BorrowingRequestsInbox';
import LabWasteDisposalLog from './pages/LabWasteDisposalLog';
import LabIncidentReports from './pages/LabIncidentReports';
import NewIncidentReport from './pages/NewIncidentReport';
import IncidentReportDetail from './pages/IncidentReportDetail';
import Departments from './pages/Departments';
import Users from './pages/Users';
import AdminPanel from './pages/AdminPanel';
import InventoryCountDetail from './pages/InventoryCountDetail';
import BookstoreRequisition from './pages/BookstoreRequisition';
import SuppliesRequisition from './pages/SuppliesRequisition';
import BguJobRequests from './pages/BguJobRequests';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="laboratories" element={<Laboratories />} />
        <Route path="laboratories/:id" element={<LaboratoryDetail />} />
        <Route path="laboratories/:id/stock-cards" element={<LabStockCards />} />
        <Route path="laboratories/:id/equipment" element={<LabEquipment />} />
        <Route path="equipment/:id" element={<EquipmentMonitoringRecord />} />
        <Route path="laboratories/:id/maintenance-schedule" element={<MaintenanceSchedule />} />
        <Route path="laboratories/:id/calibration-schedule" element={<CalibrationSchedule />} />
        <Route path="laboratories/:id/work-requests/new" element={<NewWorkRequest />} />
        <Route path="laboratories/:id/work-requests" element={<LabWorkRequests />} />
        <Route path="work-requests" element={<WorkRequestsInbox />} />
        <Route path="work-requests/:id" element={<WorkRequestDetail />} />
        <Route path="laboratories/:id/borrowing-requests/new" element={<NewBorrowingRequest />} />
        <Route path="laboratories/:id/borrowing-requests" element={<LabBorrowingRequests />} />
        <Route path="borrowing-requests" element={<BorrowingRequestsInbox />} />
        <Route path="borrowing-requests/:id" element={<BorrowingRequestDetail />} />
        <Route path="laboratories/:id/waste-disposal-log" element={<LabWasteDisposalLog />} />
        <Route path="laboratories/:id/incident-reports/new" element={<NewIncidentReport />} />
        <Route path="laboratories/:id/incident-reports" element={<LabIncidentReports />} />
        <Route path="incident-reports/:id" element={<IncidentReportDetail />} />
        <Route path="other-requests" element={<Navigate to="/other-requests/bookstore" replace />} />
        <Route path="other-requests/bookstore" element={<BookstoreRequisition />} />
        <Route path="other-requests/supplies" element={<SuppliesRequisition />} />
        <Route path="other-requests/bgu" element={<BguJobRequests />} />
        <Route path="items/:id" element={<StockCard />} />
        <Route path="inventory-counts/:id" element={<InventoryCountDetail />} />
        <Route
          path="departments"
          element={
            <AdminRoute>
              <Departments />
            </AdminRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <Users />
            </AdminRoute>
          }
        />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <AppRoutes />
      </ConfirmProvider>
    </AuthProvider>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Laboratories from './pages/Laboratories';
import LaboratoryDetail from './pages/LaboratoryDetail';
import LabStockCards from './pages/LabStockCards';
import StockCard from './pages/StockCard';
import Departments from './pages/Departments';
import Users from './pages/Users';
import InventoryCountDetail from './pages/InventoryCountDetail';

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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

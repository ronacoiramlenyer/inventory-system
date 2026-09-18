import axios from 'axios';

// In local dev this stays '/api' and goes through the Vite proxy to the
// Node/Express server. For a production build targeting the Cloudflare
// Worker, set VITE_API_URL to the deployed Worker's URL, e.g.
// https://lab-management-system-api.<your-subdomain>.workers.dev/api
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

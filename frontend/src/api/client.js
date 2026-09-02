import axios from 'axios';

// Live CodeIgniter REST API. Override with VITE_API_BASE in a .env.local
// file if the backend moves (e.g. testing against a staging URL).
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'https://pmcyellowpages.com/api',
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('crm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('crm_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

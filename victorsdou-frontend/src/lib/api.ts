import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // sends HTTP-only refresh cookie automatically
});

// Attach access token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 try to refresh; on second failure redirect to login
let isRefreshing = false;
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && !isRefreshing) {
      original._retry = true;
      isRefreshing = true;
      try {
        const { data } = await api.post('/v1/auth/refresh');
        // API shape: { data: { tokens: { accessToken } } }
        localStorage.setItem('accessToken', data.accessToken);
        isRefreshing = false;
        return api(original);
      } catch {
        isRefreshing = false;
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

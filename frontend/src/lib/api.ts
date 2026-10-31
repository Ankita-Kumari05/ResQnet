// ResQnet API Client
// Centralized Axios instance with JWT auth and offline detection

import axios, { type AxiosInstance } from 'axios'

// Support custom API URL in production (e.g. VITE_API_URL or relative /api/v1)
const rawBaseUrl = import.meta.env.VITE_API_URL || '/api/v1'
const normalizedBaseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl

const api: AxiosInstance = axios.create({
  baseURL: normalizedBaseUrl,
  timeout: 15000,
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('resqnet_token') || localStorage.getItem('resqnet_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Global response error handler
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('resqnet_token')
      sessionStorage.removeItem('resqnet_user')
      localStorage.removeItem('resqnet_token')
      localStorage.removeItem('resqnet_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

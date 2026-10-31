// ResQnet API Client
// Centralized Axios instance with JWT auth and offline detection

import axios, { type AxiosInstance } from 'axios'

const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
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

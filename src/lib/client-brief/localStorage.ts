import { FormData } from '@/types/client-brief'

const BASE_KEY = 'leaders-form-data'

const getStorageKey = (token?: string) =>
  token ? `${BASE_KEY}-${token}` : BASE_KEY

export const saveFormData = (data: Partial<FormData>, token?: string): void => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(token), JSON.stringify(data))
    } catch (error) {
      console.error('Error saving to localStorage:', error)
    }
  }
}

export const loadFormData = (token?: string): Partial<FormData> | null => {
  if (typeof window !== 'undefined') {
    try {
      const data = localStorage.getItem(getStorageKey(token))
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Error loading from localStorage:', error)
      return null
    }
  }
  return null
}

export const clearFormData = (token?: string): void => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(getStorageKey(token))
    } catch (error) {
      console.error('Error clearing localStorage:', error)
    }
  }
}

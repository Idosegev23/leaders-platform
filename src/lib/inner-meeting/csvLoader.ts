import { getContacts } from './formService'
import type { Contact as DbContact } from './types'
import type { Contact } from '@/types/inner-meeting'

export async function loadContacts(): Promise<Contact[]> {
  try {
    const dbContacts = await getContacts()
    return dbContacts.map((c: DbContact) => ({
      firstName: c.first_name,
      lastName: c.last_name,
      hebrewFirstName: c.hebrew_first_name,
      hebrewLastName: c.hebrew_last_name,
      email: c.email,
    }))
  } catch (error) {
    console.error('Error loading contacts:', error)
    return []
  }
}

export function searchContacts(contacts: Contact[], query: string): Contact[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return contacts
    .filter((c) => {
      const fullNameEn = `${c.firstName} ${c.lastName}`.toLowerCase()
      const fullNameHe = `${c.hebrewFirstName} ${c.hebrewLastName}`.toLowerCase()
      const email = c.email.toLowerCase()
      return (
        fullNameEn.includes(q) ||
        fullNameHe.includes(q) ||
        email.includes(q) ||
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.hebrewFirstName.toLowerCase().includes(q) ||
        c.hebrewLastName.toLowerCase().includes(q)
      )
    })
    .slice(0, 10)
}

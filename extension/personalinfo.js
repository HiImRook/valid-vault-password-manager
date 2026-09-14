import { encrypt, decrypt } from './crypto.js'
import { getPersonalInfo, setPersonalInfo } from './store.js'

function generateId() {
  return crypto.randomUUID()
}

function emptyProfile() {
  return {
    firstName: '',
    lastName: '',
    emails: [],
    phone: '',
    address: { street: '', city: '', state: '', zip: '', country: '' }
  }
}

async function getProfile(masterKey) {
  const record = await getPersonalInfo()
  if (!record || !record.data) {
    return { success: true, profile: emptyProfile(), updatedAt: 0 }
  }
  try {
    const json = await decrypt(record.data, masterKey)
    const profile = JSON.parse(json)
    return { success: true, profile, updatedAt: record.updatedAt || 0 }
  } catch (error) {
    return { success: false, error: 'Decryption failed' }
  }
}

async function saveProfile(profile, masterKey) {
  const json = JSON.stringify(profile)
  const encData = await encrypt(json, masterKey)
  const now = Date.now()
  const existing = await getPersonalInfo()
  await setPersonalInfo({
    data: encData,
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    updatedAt: now
  })
  return { success: true }
}

function mergeProfiles(localRecord, incomingRecord) {
  const localUpdated = localRecord && localRecord.updatedAt ? localRecord.updatedAt : 0
  const incomingUpdated = incomingRecord && incomingRecord.updatedAt ? incomingRecord.updatedAt : 0
  return incomingUpdated > localUpdated ? incomingRecord : localRecord
}

export {
  emptyProfile,
  getProfile,
  saveProfile,
  mergeProfiles,
  generateId
}

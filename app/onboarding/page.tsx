'use client'

import { useState } from 'react'

export default function OnboardingPage() {
  const [form, setForm] = useState({
    work_email: '',
    name: '',
    date_of_birth: '',
    home_address: '',
    personal_email: '',
    mobile_number: '',
    employment_start_date: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Submission failed.'); return }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F0F2F8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '40px 16px 60px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 560, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: '#3D6FE8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="white">
              <path fillRule="evenodd" d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-7 9a7 7 0 1 1 14 0H3z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>BayLegal</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>xprts.com · HRIS Portal</div>
          </div>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Contractor Onboarding</h1>
        <p style={{ fontSize: 13, color: '#5A6478', lineHeight: 1.6 }}>
          Please complete all fields below. This information will be saved to your employee profile in our system.
        </p>
      </div>

      {done ? (
        <div style={{
          width: '100%', maxWidth: 560,
          background: '#fff',
          borderRadius: 12,
          padding: '40px 32px',
          textAlign: 'center',
          border: '1px solid #E4E7F0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#16A34A">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>All done!</div>
          <p style={{ fontSize: 14, color: '#5A6478', lineHeight: 1.6 }}>
            Your information has been saved. You may close this page. Welcome to the team!
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 560 }}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #E4E7F0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}>
            {/* Section: Identity */}
            <div style={{ padding: '20px 28px 4px', borderBottom: '1px solid #F0F2F8' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                Personal Information
              </div>
              <FormField label="Work Email" hint="Your BayLegal email address (e.g. name@baylegal.com)" required>
                <input
                  type="email"
                  value={form.work_email}
                  onChange={e => set('work_email', e.target.value)}
                  placeholder="yourname@baylegal.com"
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Full Name" hint="First Name Last Name" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Juan Carlos Reyes"
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Date of Birth" required>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={e => set('date_of_birth', e.target.value)}
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Complete Home Address" required>
                <textarea
                  value={form.home_address}
                  onChange={e => set('home_address', e.target.value)}
                  placeholder="Street, Barangay, City, Province, ZIP"
                  required
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', height: 'auto' }}
                />
              </FormField>
              <FormField label="Personal Email Address" hint="Not your BayLegal email" required>
                <input
                  type="email"
                  value={form.personal_email}
                  onChange={e => set('personal_email', e.target.value)}
                  placeholder="yourpersonalemail@gmail.com"
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Mobile Number" hint="Format: +639xxxxxxxxx" required>
                <input
                  type="tel"
                  value={form.mobile_number}
                  onChange={e => set('mobile_number', e.target.value)}
                  placeholder="+639xxxxxxxxx"
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Start Date" hint="Your first day of work" required>
                <input
                  type="date"
                  value={form.employment_start_date}
                  onChange={e => set('employment_start_date', e.target.value)}
                  required
                  style={inputStyle}
                />
              </FormField>
            </div>

            {/* Section: Emergency Contact */}
            <div style={{ padding: '20px 28px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                Emergency Contact
              </div>
              <FormField label="Name & Relationship" hint="e.g. Juan Carlos - Husband" required>
                <input
                  type="text"
                  value={form.emergency_contact_name}
                  onChange={e => set('emergency_contact_name', e.target.value)}
                  placeholder="e.g. Maria Santos - Mother"
                  required
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Emergency Contact Mobile" hint="Format: +639xxxxxxxxx" required>
                <input
                  type="tel"
                  value={form.emergency_contact_phone}
                  onChange={e => set('emergency_contact_phone', e.target.value)}
                  placeholder="+639xxxxxxxxx"
                  required
                  style={inputStyle}
                />
              </FormField>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #F0F2F8' }}>
              {error && (
                <div style={{
                  background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8,
                  padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 14,
                }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  background: submitting ? '#9CA3AF' : '#3D6FE8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Onboarding Form'}
              </button>
              <p style={{ fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', marginTop: 12 }}>
                All fields are required. Your information is saved securely.
              </p>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

function FormField({ label, hint, required, children }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
        {label}
        {required && <span style={{ color: '#DC2626', marginLeft: 3 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: 11.5, color: '#9CA3AF', marginBottom: 5 }}>{hint}</div>}
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #E4E7F0',
  borderRadius: 7,
  fontSize: 13,
  color: '#111827',
  background: '#fff',
  outline: 'none',
  transition: 'border-color 0.15s',
  display: 'block',
}

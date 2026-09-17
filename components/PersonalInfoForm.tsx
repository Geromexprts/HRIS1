'use client'

import { useState } from 'react'

type PersonalInfo = {
  name: string
  date_of_birth: string | null
  home_address: string | null
  personal_email: string | null
  mobile_number: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
}

export function PersonalInfoForm({ initial }: { initial: PersonalInfo }) {
  const [form, setForm] = useState<PersonalInfo>(initial)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  function set(field: keyof PersonalInfo, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    setSaving(false)
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function handleCancel() {
    setForm(initial)
    setEditing(false)
    setError('')
  }

  const hasAnyData = !!(form.name || Object.values(form).some(v => v))

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Personal &amp; Contact Info</div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: 12.5, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            {hasAnyData ? 'Edit' : 'Add Info'}
          </button>
        )}
        {saved && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>Saved</span>}
      </div>

      {!editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          {!hasAnyData ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              No personal info on file.{' '}
              <button onClick={() => setEditing(true)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 13, padding: 0 }}>
                Add it now.
              </button>
            </p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <ViewRow label="Full Name" value={form.name} />
                <ViewRow label="Date of Birth" value={form.date_of_birth} />
                <ViewRow label="Personal Email" value={form.personal_email} />
                <ViewRow label="Mobile Number" value={form.mobile_number} />
                <ViewRow label="Emergency Contact" value={form.emergency_contact_name} />
                <ViewRow label="Emergency Phone" value={form.emergency_contact_phone} />
              </div>
              {form.home_address && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Home Address</span>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13, marginTop: 3, whiteSpace: 'pre-line' }}>{form.home_address}</div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Full Name">
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="First Last"
                className="field-input"
              />
            </Field>
            <Field label="Date of Birth">
              <input
                type="date"
                value={form.date_of_birth ?? ''}
                onChange={e => set('date_of_birth', e.target.value)}
                className="field-input"
              />
            </Field>
            <Field label="Personal Email">
              <input
                type="email"
                value={form.personal_email ?? ''}
                onChange={e => set('personal_email', e.target.value)}
                placeholder="your@gmail.com"
                className="field-input"
              />
            </Field>
            <Field label="Mobile Number">
              <input
                type="tel"
                value={form.mobile_number ?? ''}
                onChange={e => set('mobile_number', e.target.value)}
                placeholder="+639xxxxxxxxx"
                className="field-input"
              />
            </Field>
          </div>
          <Field label="Home Address">
            <textarea
              value={form.home_address ?? ''}
              onChange={e => set('home_address', e.target.value)}
              placeholder="Street, City, Province, ZIP"
              rows={3}
              className="field-input"
              style={{ resize: 'vertical' }}
            />
          </Field>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Emergency Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Name &amp; Relationship">
                <input
                  type="text"
                  value={form.emergency_contact_name ?? ''}
                  onChange={e => set('emergency_contact_name', e.target.value)}
                  placeholder="e.g. Maria Santos - Mother"
                  className="field-input"
                />
              </Field>
              <Field label="Mobile Number">
                <input
                  type="tel"
                  value={form.emergency_contact_phone ?? ''}
                  onChange={e => set('emergency_contact_phone', e.target.value)}
                  placeholder="+639xxxxxxxxx"
                  className="field-input"
                />
              </Field>
            </div>
          </div>
          {error && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={handleCancel} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ViewRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label" dangerouslySetInnerHTML={{ __html: label }} />
      {children}
    </div>
  )
}

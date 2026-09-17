'use client'

import { useState, useEffect } from 'react'

const LA_TZ = 'America/Los_Angeles'

type TimeEntry = {
  id: string; date: string
  clock_in: string | null; clock_out: string | null
  total_hours: number | null
  is_edited: boolean; edit_note: string | null
}

function toTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: LA_TZ })
}

function toDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function utcToLAInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

function laInputToUTC(localStr: string): string {
  const [datePart, timePart] = localStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes)
  const laParts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(utcGuess))
  const laH = parseInt(laParts.find(p => p.type === 'hour')?.value ?? '0')
  const laM = parseInt(laParts.find(p => p.type === 'minute')?.value ?? '0')
  const offsetMs = ((hours - laH) * 60 + (minutes - laM)) * 60000
  return new Date(utcGuess + offsetMs).toISOString()
}

function isLocked(dateStr: string) {
  const today = new Date()
  if (today.getDate() < 25) return false
  const entry = new Date(dateStr + 'T12:00:00')
  const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 26)
  const periodEnd = new Date(today.getFullYear(), today.getMonth(), 25)
  return entry >= periodStart && entry <= periodEnd
}

function getStatus(entry: TimeEntry | null) {
  if (!entry?.clock_in) return 'not_started'
  if (entry.clock_out) return 'clocked_out'
  return 'clocked_in'
}

function EditModal({ entry, onClose, onSave }: { entry: TimeEntry; onClose: () => void; onSave: (u: TimeEntry) => void }) {
  const [clockOut, setClockOut] = useState(utcToLAInput(entry.clock_out))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!clockOut) { setError('Clock-out time is required.'); return }
    setSaving(true)
    const res = await fetch('/api/time', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, clock_in: entry.clock_in, clock_out: laInputToUTC(clockOut), edit_note: note }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    onSave(data)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Edit Clock-Out Time</div>
        <div className="modal-sub">
          {toDate(entry.date)} · This edit will be flagged for admin review.
          <span style={{ color: 'var(--accent)', marginLeft: 6 }}>All times in PST</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Clock In <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(not editable)</span></label>
            <input type="datetime-local" value={utcToLAInput(entry.clock_in)} disabled className="field-input" style={{ opacity: 0.5, cursor: 'not-allowed' }} />
          </div>
          <div>
            <label className="field-label">Clock Out</label>
            <input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)} className="field-input" autoFocus />
          </div>
          <div>
            <label className="field-label">Reason for edit</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. forgot to clock out" className="field-input" />
          </div>
          {error && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function TimeTracker({ employeeId, todayEntry, recentEntries }: {
  employeeId: string; todayEntry: TimeEntry | null; recentEntries: TimeEntry[]
}) {
  const [entry, setEntry] = useState<TimeEntry | null>(todayEntry)
  const [entries, setEntries] = useState<TimeEntry[]>(recentEntries)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState('00:00:00')
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const status = getStatus(entry)

  useEffect(() => {
    if (status !== 'clocked_in') return
    const interval = setInterval(() => {
      if (!entry?.clock_in) return
      const totalMs = Math.max(0, Date.now() - new Date(entry.clock_in).getTime())
      const h = Math.floor(totalMs / 3600000)
      const m = Math.floor((totalMs % 3600000) / 60000)
      const s = Math.floor((totalMs % 60000) / 1000)
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [entry, status])

  async function doAction(action: string) {
    setLoading(true)
    const res = await fetch('/api/time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const data = await res.json()
    if (res.ok) {
      setEntry(data)
      setEntries(prev => {
        const idx = prev.findIndex(e => e.id === data.id)
        return idx >= 0 ? prev.map(e => e.id === data.id ? data : e) : [data, ...prev]
      })
    }
    setLoading(false)
  }

  function handleEditSave(updated: TimeEntry) {
    if (updated.date === new Date().toISOString().split('T')[0]) setEntry(updated)
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    setEditingEntry(null)
  }

  const filteredEntries = entries.filter(e => {
    if (filterFrom && e.date < filterFrom) return false
    if (filterTo && e.date > filterTo) return false
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {editingEntry && <EditModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSave={handleEditSave} />}

      {/* Clock card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {toDate(new Date().toISOString().split('T')[0])} · PST
            </div>
            {status === 'clocked_in' ? (
              <div className="clock-display">
                {elapsed}
              </div>
            ) : status === 'clocked_out' ? (
              <div className="clock-display">{entry?.total_hours}<span style={{ fontSize: 20, color: 'var(--text-muted)', marginLeft: 6 }}>hrs</span></div>
            ) : (
              <div className="clock-display" style={{ color: 'var(--text-muted)' }}>--:--:--</div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 2 }}>
            {entry?.clock_in && (
              <div>
                <span>In: <strong style={{ color: 'var(--text-secondary)' }}>{toTime(entry.clock_in)}</strong></span>
              </div>
            )}
            {entry?.clock_out && <div>Out: <strong style={{ color: 'var(--text-secondary)' }}>{toTime(entry.clock_out)}</strong></div>}
            {status === 'clocked_in' && <span className="badge badge-green">Active</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {status === 'not_started' && (
            <button onClick={() => doAction('clock_in')} disabled={loading} className="btn btn-green">Clock In</button>
          )}
          {status === 'clocked_in' && (
            <button onClick={() => doAction('clock_out')} disabled={loading} className="btn btn-red">Clock Out</button>
          )}
          {status === 'clocked_out' && entry && !isLocked(entry.date) && (
            <>
              <button onClick={() => doAction('resume')} disabled={loading} className="btn btn-primary">Resume</button>
              <button onClick={() => setEditingEntry(entry)} className="btn btn-ghost">Edit Entry</button>
            </>
          )}
          {status === 'clocked_out' && entry && isLocked(entry.date) && (
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 0' }}>Pay period locked — no further edits.</span>
          )}
        </div>

        {status === 'clocked_in' && (
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12 }}>
            1-hour break is automatically deducted on clock out.
          </p>
        )}
      </div>

      {/* All time entries */}
      {entries.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>All Time Entries <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({filteredEntries.length} record{filteredEntries.length !== 1 ? 's' : ''})</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>From</span>
              <input
                type="date"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5, color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
              />
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>To</span>
              <input
                type="date"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5, color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
              />
              {(filterFrom || filterTo) && (
                <button
                  onClick={() => { setFilterFrom(''); setFilterTo('') }}
                  style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Hours</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>No entries in selected range.</td></tr>
                ) : filteredEntries.map(e => (
                  <tr key={e.id}>
                    <td>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{toDate(e.date)}</span>
                      {e.is_edited && <span className="badge badge-amber" style={{ marginLeft: 8 }}>Edited</span>}
                    </td>
                    <td>{e.clock_in ? toTime(e.clock_in) : '—'}</td>
                    <td>{e.clock_out ? toTime(e.clock_out) : '—'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.total_hours ?? '—'}</td>
                    <td>
                      {e.clock_out && !isLocked(e.date)
                        ? <button onClick={() => setEditingEntry(e)} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Edit</button>
                        : isLocked(e.date) ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Locked</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

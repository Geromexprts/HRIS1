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

function OtModal({ entry, onClose }: { entry: TimeEntry; onClose: () => void }) {
  const [step, setStep] = useState<'ask' | 'form' | 'done'>('ask')
  const [otStartTime, setOtStartTime] = useState('')
  const [otEndTime, setOtEndTime] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submittedHours, setSubmittedHours] = useState('')

  function initFormTimes() {
    // Pre-fill end time with clock-out, start time 1h before
    const clockOutLA = utcToLAInput(entry.clock_out)
    setOtEndTime(clockOutLA ? clockOutLA.split('T')[1] : '')
    if (clockOutLA) {
      const [h, m] = clockOutLA.split('T')[1].split(':').map(Number)
      const startH = h - 1
      if (startH >= 0) {
        setOtStartTime(`${String(startH).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      } else {
        setOtStartTime('')
      }
    }
  }

  async function submit() {
    if (!otStartTime || !otEndTime) { setError('Both start and end times are required.'); return }
    // Build ISO timestamps using the entry's date
    const toISO = (timeStr: string) => laInputToUTC(`${entry.date}T${timeStr}`)
    const startISO = toISO(otStartTime)
    const endISO = toISO(otEndTime)
    if (new Date(endISO) <= new Date(startISO)) { setError('End time must be after start time.'); return }
    const hrs = Math.round(((new Date(endISO).getTime() - new Date(startISO).getTime()) / 3600000) * 100) / 100
    setSaving(true); setError('')
    const res = await fetch('/api/ot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: entry.date, ot_start_time: startISO, ot_end_time: endISO, reason: reason || null, time_entry_id: entry.id }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to submit.'); setSaving(false); return }
    setSubmittedHours(String(hrs))
    setStep('done')
  }

  if (step === 'done') {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div className="modal-title">OT Request Submitted</div>
          <div className="modal-sub" style={{ marginBottom: 20 }}>
            Your overtime request for {submittedHours}h has been sent to your manager for approval.
          </div>
          <button onClick={onClose} className="btn btn-primary" style={{ width: '100%' }}>Done</button>
        </div>
      </div>
    )
  }

  if (step === 'ask') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-title">Did you work overtime today?</div>
          <div className="modal-sub" style={{ marginBottom: 20 }}>
            {toDate(entry.date)} · {entry.total_hours}h logged
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { initFormTimes(); setStep('form') }} className="btn btn-primary" style={{ flex: 1 }}>
              Yes, add OT request
            </button>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>No, skip</button>
          </div>
        </div>
      </div>
    )
  }

  const clockInDisplay = entry.clock_in ? toTime(entry.clock_in) : '—'
  const clockOutDisplay = entry.clock_out ? toTime(entry.clock_out) : '—'

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Overtime Request</div>
        <div className="modal-sub">{toDate(entry.date)} · {entry.total_hours}h logged today</div>

        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Clocked In: </span><strong>{clockInDisplay}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Clocked Out: </span><strong>{clockOutDisplay}</strong></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">OT Start Time</label>
              <input
                type="time"
                value={otStartTime}
                onChange={e => setOtStartTime(e.target.value)}
                className="field-input"
                autoFocus
              />
            </div>
            <div>
              <label className="field-label">OT End Time</label>
              <input
                type="time"
                value={otEndTime}
                onChange={e => setOtEndTime(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
          {otStartTime && otEndTime && (() => {
            const hrs = Math.round(((new Date(`2000-01-01T${otEndTime}`).getTime() - new Date(`2000-01-01T${otStartTime}`).getTime()) / 3600000) * 100) / 100
            return hrs > 0 ? <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Duration: <strong>{hrs}h</strong></p> : null
          })()}
          <div>
            <label className="field-label">Reason <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="field-input"
              rows={2}
              style={{ resize: 'vertical' }}
              placeholder="e.g. Project deadline, client meeting ran late"
            />
          </div>
          {error && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={submit} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
            {saving ? 'Submitting…' : 'Submit OT Request'}
          </button>
          <button onClick={() => setStep('ask')} className="btn btn-ghost">Back</button>
        </div>
      </div>
    </div>
  )
}

function getLAMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}

type OtRequest = {
  id: string; date: string; ot_hours: number; ot_start_time: string | null; ot_end_time: string | null
  reason: string | null; status: string; created_at: string
}

export function TimeTracker({ employeeId, todayEntry, recentEntries, earlyClockIn = false, otRequests: initialOtRequests = [] }: {
  employeeId: string; todayEntry: TimeEntry | null; recentEntries: TimeEntry[]; earlyClockIn?: boolean; otRequests?: OtRequest[]
}) {
  const [entry, setEntry] = useState<TimeEntry | null>(todayEntry)
  const [entries, setEntries] = useState<TimeEntry[]>(recentEntries)
  const [otRequests, setOtRequests] = useState<OtRequest[]>(initialOtRequests)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState('00:00:00')
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [otEntry, setOtEntry] = useState<TimeEntry | null>(null)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [cancellingOt, setCancellingOt] = useState<string | null>(null)

  const status = getStatus(entry)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (earlyClockIn || status !== 'not_started') return
    if (getLAMinutes() >= 7 * 60 + 50) return
    const msUntil = (7 * 60 + 50 - getLAMinutes()) * 60 * 1000
    const id = setTimeout(() => setTick(t => t + 1), msUntil)
    return () => clearTimeout(id)
  }, [earlyClockIn, status])

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
      if (action === 'clock_out') {
        setOtEntry(data)
      }
    }
    setLoading(false)
  }

  function handleEditSave(updated: TimeEntry) {
    if (updated.date === new Date().toISOString().split('T')[0]) setEntry(updated)
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    setEditingEntry(null)
  }

  async function cancelOtRequest(requestId: string) {
    setCancellingOt(requestId)
    const res = await fetch('/api/ot', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    })
    if (res.ok) {
      setOtRequests(prev => prev.filter(r => r.id !== requestId))
    }
    setCancellingOt(null)
  }

  const filteredEntries = entries.filter(e => {
    if (filterFrom && e.date < filterFrom) return false
    if (filterTo && e.date > filterTo) return false
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {editingEntry && <EditModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSave={handleEditSave} />}
      {otEntry && <OtModal entry={otEntry} onClose={() => setOtEntry(null)} />}

      {/* Clock card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {toDate(new Date().toISOString().split('T')[0])} · PST
            </div>
            {status === 'clocked_in' ? (
              <div className="clock-display">{elapsed}</div>
            ) : status === 'clocked_out' ? (
              <div className="clock-display">{entry?.total_hours}<span style={{ fontSize: 20, color: 'var(--text-muted)', marginLeft: 6 }}>hrs</span></div>
            ) : (
              <div className="clock-display" style={{ color: 'var(--text-muted)' }}>--:--:--</div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 2 }}>
            {entry?.clock_in && (
              <div><span>In: <strong style={{ color: 'var(--text-secondary)' }}>{toTime(entry.clock_in)}</strong></span></div>
            )}
            {entry?.clock_out && <div>Out: <strong style={{ color: 'var(--text-secondary)' }}>{toTime(entry.clock_out)}</strong></div>}
            {status === 'clocked_in' && <span className="badge badge-green">Active</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {status === 'not_started' && (
            !earlyClockIn && getLAMinutes() < 7 * 60 + 50
              ? <span style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Clock-in available at 7:50 AM PST</span>
              : <button onClick={() => doAction('clock_in')} disabled={loading} className="btn btn-green">Clock In</button>
          )}
          {status === 'clocked_in' && (
            <button onClick={() => doAction('clock_out')} disabled={loading} className="btn btn-red">Clock Out</button>
          )}
          {status === 'clocked_out' && entry && !isLocked(entry.date) && (
            <>
              {entry.date === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) && (
                <button onClick={() => doAction('resume')} disabled={loading} className="btn btn-primary">Resume</button>
              )}
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

      {/* OT Requests */}
      {otRequests.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Overtime Requests</div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>OT Start</th>
                  <th>OT End</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {otRequests.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12.5 }}>{toDate(r.date)}</td>
                    <td style={{ fontSize: 12.5 }}>{r.ot_start_time ? toTime(r.ot_start_time) : '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{r.ot_end_time ? toTime(r.ot_end_time) : '—'}</td>
                    <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.ot_hours}h</td>
                    <td>
                      <span className={`badge ${r.status === 'approved' ? 'badge-green' : r.status === 'denied' ? 'badge-red' : 'badge-amber'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.reason ?? '—'}</td>
                    <td>
                      {r.status === 'denied' && (
                        <button
                          onClick={() => cancelOtRequest(r.id)}
                          disabled={cancellingOt === r.id}
                          style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                        >
                          {cancellingOt === r.id ? 'Cancelling…' : 'Cancel & Resubmit'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All time entries */}
      {entries.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>All Time Entries <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({filteredEntries.length} record{filteredEntries.length !== 1 ? 's' : ''})</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>From</span>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5, color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>To</span>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5, color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
              {(filterFrom || filterTo) && (
                <button onClick={() => { setFilterFrom(''); setFilterTo('') }}
                  style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
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

'use client'

import { useState } from 'react'

export function CopyOnboardingLink() {
  const [copied, setCopied] = useState(false)

  function copy() {
    const url = `${window.location.origin}/onboarding`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={copy}
      style={{
        fontSize: 12, fontWeight: 500,
        color: copied ? 'var(--green)' : 'var(--accent)',
        background: copied ? 'var(--green-soft)' : 'var(--accent-soft)',
        border: 'none', borderRadius: 6,
        padding: '5px 12px', cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {copied ? '✓ Link Copied' : 'Copy Onboarding Link'}
    </button>
  )
}

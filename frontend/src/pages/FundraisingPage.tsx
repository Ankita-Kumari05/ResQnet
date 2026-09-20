// Fundraising Page — Redesigned to match stitch resqnet_support_verified_relief_campaigns template
// Government-grade light design: verified campaign cards, progress bars, donation flow
import { useState, useEffect } from 'react'
import api from '../lib/api'
import type { Campaign, ResourceType } from '../types'
import toast from 'react-hot-toast'

const RESOURCE_ICON: Record<ResourceType, string> = {
  food: 'restaurant',
  water: 'water_drop',
  medical: 'medical_services',
  shelter_kit: 'night_shelter',
}

const RESOURCE_COLOR: Record<ResourceType, string> = {
  food: '#d97706',
  water: '#006398',
  medical: '#dc2626',
  shelter_kit: '#16a34a',
}

export default function FundraisingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [donating, setDonating] = useState<number | null>(null)
  const [donorName, setDonorName] = useState('')
  const [donorAmount, setDonorAmount] = useState(500)
  const [donorMessage, setDonorMessage] = useState('')
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null)

  useEffect(() => { loadCampaigns() }, [])

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const res = await api.get('/campaigns')
      setCampaigns(res.data)
    } catch {
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const donate = async (campaignId: number) => {
    setDonating(campaignId)
    try {
      await api.post('/donations', {
        campaign_id: campaignId,
        donor_name: donorName || 'Anonymous Donor',
        amount: Number(donorAmount),
        message: donorMessage || undefined,
        transaction_ref: crypto.randomUUID(),
      })
      toast.success(`Thank you! ₹${donorAmount} donated successfully 🙏`)
      setActiveCampaignId(null)
      setDonorName('')
      setDonorMessage('')
      loadCampaigns()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Donation failed')
    } finally {
      setDonating(null)
    }
  }

  const shareLink = async (campaign: Campaign) => {
    const url = `${window.location.origin}/donate/${campaign.share_slug}`
    await navigator.clipboard?.writeText(url)
    toast.success('Campaign link copied!')
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active')
  const totalDisbursed = campaigns.reduce((sum, c) => sum + c.raised_amount, 0)

  if (loading) return (
    <div className="loading-overlay"><div className="spinner spinner-lg" /><p>Loading campaigns…</p></div>
  )

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#f8f9ff' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1.25rem' }}>

        {/* ── Header ────────────────────────────────── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>RESQNET</span>
            <span style={{ color: '#c6c6cd' }}>/</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>DONATIONS & RELIEF</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="badge badge-emergency" style={{ fontSize: '0.55rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>verified</span>
              NDRF Audited Framework
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 0.35rem', color: '#0b1c30' }}>Support Verified Relief</h1>
              <p style={{ color: '#64748b', fontSize: '0.875rem', maxWidth: 500 }}>
                Support verified emergency resource needs through trusted, accredited organizations.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>Active Campaigns</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#0b1c30' }}>
                  {String(activeCampaigns.length).padStart(2, '0')} Manifests
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>Total Disbursed</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#16a34a' }}>
                  ₹{totalDisbursed.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Direct Impact note */}
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe',
          borderLeft: '3px solid #006398', borderRadius: 6,
          padding: '0.85rem 1rem', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#006398', flexShrink: 0, marginTop: 2 }}>shield</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <strong style={{ fontSize: '0.875rem', color: '#0b1c30' }}>Direct Impact Guarantee</strong>
              <span className="badge badge-advisory" style={{ fontSize: '0.55rem' }}>AUDITED LEDGER</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#45464d', lineHeight: 1.5 }}>
              100% of verified contributions directly support active emergency resource manifests audited by state disaster authorities.
              Every rupee maps to certified vendor supplies and ground distributions with published manifests.
            </p>
          </div>
        </div>

        {campaigns.length === 0 && (
          <div className="empty-state" style={{ padding: '4rem' }}>
            <div className="empty-state-icon">🛡️</div>
            <p>No active campaigns yet. Resource shortages at Safety Hubs will auto-generate campaigns.</p>
          </div>
        )}

        {/* Campaign Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1rem' }}>
          {campaigns.map(c => {
            const iconName = c.resource_type ? RESOURCE_ICON[c.resource_type] : 'volunteer_activism'
            const iconColor = c.resource_type ? RESOURCE_COLOR[c.resource_type] : '#006398'
            const pct = Math.min(100, c.progress_percent)
            return (
              <div key={c.id} className="campaign-card fade-in">
                {/* Campaign header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <div style={{
                      width: 36, height: 36, background: `${iconColor}15`, borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      border: `1px solid ${iconColor}30`,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: iconColor }}>{iconName}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-open" style={{ fontSize: '0.55rem' }}>● CAMPAIGN ACTIVE</span>
                      </div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, lineHeight: 1.3, letterSpacing: '-0.01em', color: '#0b1c30' }}>{c.title}</h3>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => shareLink(c)}
                    title="Copy share link"
                    style={{ padding: '0.25rem', flexShrink: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>share</span>
                  </button>
                </div>

                {c.description && (
                  <p style={{ fontSize: '0.8125rem', color: '#45464d', lineHeight: 1.55 }}>{c.description}</p>
                )}

                {/* Progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.35rem' }}>
                    <span style={{ color: '#64748b' }}>
                      ₹{c.raised_amount.toLocaleString()} raised of ₹{c.target_amount.toLocaleString()} target
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700,
                      color: pct >= 100 ? '#16a34a' : pct >= 70 ? '#d97706' : '#006398',
                    }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar thick">
                    <div
                      className={`progress-bar-fill ${pct >= 100 ? 'success' : pct >= 70 ? 'warning' : ''}`}
                      style={{ width: `${pct}%`, background: pct >= 100 ? undefined : pct >= 70 ? undefined : '#006398' }}
                    />
                  </div>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: '#64748b', marginTop: '0.25rem', letterSpacing: '0.04em' }}>
                    VERIFIED DIRECT LINE · ₹{(c.target_amount - c.raised_amount).toLocaleString()} remaining
                  </p>
                </div>

                {/* Donate action */}
                {c.status === 'active' && (
                  <>
                    {activeCampaignId !== c.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          id={`donate-btn-${c.id}`}
                          className="btn btn-primary"
                          onClick={() => setActiveCampaignId(c.id)}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>volunteer_activism</span>
                          [ VIEW CAMPAIGN ]
                        </button>
                        <button className="btn btn-secondary" onClick={() => { }} style={{ justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>map</span>
                          View on Map
                        </button>
                      </div>
                    ) : (
                      <div className="fade-in" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div>
                          <label>Your Name (optional)</label>
                          <input className="input" value={donorName} onChange={e => setDonorName(e.target.value)} placeholder="Anonymous" />
                        </div>
                        <div>
                          <label>Amount (₹)</label>
                          <input className="input" type="number" min={10} value={donorAmount} onChange={e => setDonorAmount(Number(e.target.value))} />
                        </div>
                        {/* Quick amount buttons */}
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {[500, 1000, 2500, 5000].map(amt => (
                            <button
                              key={amt}
                              className={`btn btn-sm ${donorAmount === amt ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setDonorAmount(amt)}
                            >
                              ₹{amt}
                            </button>
                          ))}
                        </div>
                        <div>
                          <label>Message (optional)</label>
                          <input className="input" value={donorMessage} onChange={e => setDonorMessage(e.target.value)} placeholder="Stay strong!" />
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            id={`donate-confirm-${c.id}`}
                            className="btn btn-primary"
                            style={{ flex: 1, justifyContent: 'center' }}
                            onClick={() => donate(c.id)}
                            disabled={donating === c.id}
                          >
                            {donating === c.id
                              ? <><span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 0.7s linear infinite' }}>progress_activity</span> Processing…</>
                              : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock</span> Authorize Direct Escrow ₹{donorAmount}</>
                            }
                          </button>
                          <button className="btn btn-secondary" onClick={() => setActiveCampaignId(null)}>Cancel</button>
                        </div>
                        <p style={{ fontSize: '0.6875rem', color: '#64748b', textAlign: 'center' }}>
                          🔒 Sandbox donation · authenticated · no real payment processed
                        </p>
                      </div>
                    )}
                  </>
                )}

                {c.status !== 'active' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.6rem', background: '#f1f5f9', borderRadius: 4, fontSize: '0.75rem', color: '#64748b' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                    Campaign {c.status} — {c.status === 'fulfilled' ? 'Target achieved' : 'Closed'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Trust Indicators */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
          {[
            { icon: 'account_balance', title: 'Treasury Escrow', desc: 'Funds unlock directly to verified vendor manifests upon GPS delivery sign-off by sector wardens.' },
            { icon: 'receipt_long', title: 'Cryptographic Receipts', desc: 'Every patron receives a verifiable transaction hash linked to the state disaster audit board.' },
            { icon: 'percent', title: 'Zero Commission Fee', desc: 'Payment gateway charges are underwritten by civic institutional partners. 100% nominal amount funds physical supplies.' },
          ].map(item => (
            <div key={item.title} style={{ padding: '1rem', textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, background: '#eff6ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', border: '1px solid #bfdbfe' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#006398' }}>{item.icon}</span>
              </div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.35rem', color: '#0b1c30' }}>{item.title}</h4>
              <p style={{ fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.55 }}>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0', marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6875rem', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>
          <span>ResQnet Citizen Portal © 2025. Official Disaster Response Framework.</span>
          <span>NATIONAL DISASTER RESPONSE NETWORK · ENCRYPTED-CAP-V1.2</span>
        </div>
      </div>
    </div>
  )
}

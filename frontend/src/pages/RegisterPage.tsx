// RegisterPage — Comprehensive Registration Flow for all roles
// Adhering to Stitch templates:
// - resqnet_choose_account_type (Selection cards for Citizen, Coordinator, Responder/NGO, and Administrator prompt)
// - resqnet_citizen_registration (Multi-section: Personal Info, Location with Auto-detect, Emergency Contact, Password)
// - resqnet_coordinator_registration (EOC official credentials, department, jurisdiction, verification warning)
// - resqnet_ngo_responder_registration (Multi-step organization profile, capabilities, resources, document upload)
// - resqnet_verification_pending & resqnet_registration_submitted (Dossier overview, pipeline progress, hotline info)

import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'

type RegistrationStep = 'choose' | 'citizen' | 'coordinator' | 'responder' | 'submitted'

interface SubmittedDocket {
  referenceId: string
  role: string
  entityName: string
  applicantName: string
  submittedAt: string
  message: string
}

export default function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<RegistrationStep>('choose')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submittedDocket, setSubmittedDocket] = useState<SubmittedDocket | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)

  // Citizen Form State
  const [citizenName, setCitizenName] = useState('')
  const [citizenEmail, setCitizenEmail] = useState('')
  const [citizenPhone, setCitizenPhone] = useState('')
  const [citizenStreet, setCitizenStreet] = useState('')
  const [citizenCity, setCitizenCity] = useState('Chandigarh')
  const [citizenState, setCitizenState] = useState('chandigarh')
  const [citizenPincode, setCitizenPincode] = useState('160017')
  const [citizenContactName, setCitizenContactName] = useState('')
  const [citizenContactPhone, setCitizenContactPhone] = useState('')
  const [citizenContactRelation, setCitizenContactRelation] = useState('parent')
  const [citizenPassword, setCitizenPassword] = useState('')
  const [citizenConfirmPassword, setCitizenConfirmPassword] = useState('')
  const [showCitizenPw, setShowCitizenPw] = useState(false)
  const [detectingGps, setDetectingGps] = useState(false)

  // Coordinator Form State
  const [coordName, setCoordName] = useState('Dr. Arjun Mehta')
  const [coordEmail, setCoordEmail] = useState('arjun.mehta@punjabdisaster.gov.in')
  const [coordPhone, setCoordPhone] = useState('+91 98765 12099')
  const [coordDept, setCoordDept] = useState('SDMA')
  const [coordDesignation, setCoordDesignation] = useState('District Disaster Management Officer')
  const [coordState, setCoordState] = useState('Punjab')
  const [coordDistrict, setCoordDistrict] = useState('Mohali (SAS Nagar)')
  const [coordGovId, setCoordGovId] = useState('SDMA-PB-2026-0812')
  const [coordPassword, setCoordPassword] = useState('')
  const [coordConfirmPassword, setCoordConfirmPassword] = useState('')

  // Responder/NGO Form State
  const [ngoOrgName, setNgoOrgName] = useState('Punjab Community Response Network')
  const [ngoRegNo, setNgoRegNo] = useState('CRN-PB-2021-0941')
  const [ngoLeadName, setNgoLeadName] = useState('Simran Kaur')
  const [ngoEmail, setNgoEmail] = useState('simran.kaur@pcrn-relief.org')
  const [ngoPhone, setNgoPhone] = useState('+91 98765 43210')
  const [ngoRegion, setNgoRegion] = useState('Ludhiana, Mohali, Amritsar')
  const [ngoHeadcount, setNgoHeadcount] = useState('45')
  const [ngoSpecializations, setNgoSpecializations] = useState<string[]>([
    'Search & Rescue',
    'Flood Evacuation',
    'Medical Auxiliary',
    'Logistics & Relief',
  ])
  const [ngoPassword, setNgoPassword] = useState('')
  const [ngoConfirmPassword, setNgoConfirmPassword] = useState('')

  // GPS auto-detect helper
  const handleAutoDetectLocation = () => {
    setDetectingGps(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCitizenStreet(`GPS Fix Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)}`)
          setDetectingGps(false)
        },
        () => {
          setCitizenStreet('Sector 17 Command Zone, Chandigarh')
          setDetectingGps(false)
        },
        { timeout: 5000 }
      )
    } else {
      setCitizenStreet('Sector 17 Command Zone, Chandigarh')
      setDetectingGps(false)
    }
  }

  // Handle Citizen Submit -> Directly registers with POST /api/v1/auth/register and logs in
  const handleCitizenSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (citizenPassword !== citizenConfirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (citizenPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/register', {
        email: citizenEmail,
        full_name: citizenName,
        password: citizenPassword,
        role: 'citizen',
      })

      // Immediately log in with credentials
      await login(citizenEmail, citizenPassword)
      navigate('/')
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || err.response?.data?.message || 'Failed to create account. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Handle Coordinator Submit -> Submits intake application to /api/v1/auth/register/apply
  const handleCoordinatorSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (coordPassword !== coordConfirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (coordPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/register/apply', {
        role: 'coordinator',
        full_name: coordName,
        email: coordEmail,
        phone: coordPhone,
        department_or_org: `${coordDept} - ${coordDesignation}`,
        designation: coordDesignation,
        gov_id: coordGovId,
        state: coordState,
        district: coordDistrict,
      })

      setSubmittedDocket({
        referenceId: res.data.reference_id,
        role: 'Coordinator',
        entityName: `${coordState} SDMA (${coordDistrict})`,
        applicantName: `${coordName} (${coordDesignation})`,
        submittedAt: res.data.submitted_at,
        message: res.data.message,
      })
      setStep('submitted')
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || err.response?.data?.message || 'Failed to lodge application.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Handle Responder / NGO Submit -> Submits intake application to /api/v1/auth/register/apply
  const handleResponderSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (ngoPassword !== ngoConfirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (ngoPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/register/apply', {
        role: 'responder',
        full_name: ngoLeadName,
        email: ngoEmail,
        phone: ngoPhone,
        department_or_org: ngoOrgName,
        ngo_reg_no: ngoRegNo,
        headcount: parseInt(ngoHeadcount, 10) || 10,
        specializations: ngoSpecializations,
        state: 'Punjab',
        district: ngoRegion,
      })

      setSubmittedDocket({
        referenceId: res.data.reference_id,
        role: 'NGO / Responder Ground Fleet',
        entityName: `${ngoOrgName} (Reg #${ngoRegNo})`,
        applicantName: `${ngoLeadName} (Lead Officer)`,
        submittedAt: res.data.submitted_at,
        message: res.data.message,
      })
      setStep('submitted')
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || err.response?.data?.message || 'Failed to lodge application.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const copyRefId = () => {
    if (submittedDocket?.referenceId) {
      navigator.clipboard.writeText(submittedDocket.referenceId)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f9ff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Public Sans', system-ui, sans-serif",
      color: '#0b1c30',
    }}>
      {/* ── Top Official Header Bar (Consistent with Stitch Archetype) ── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(248, 249, 255, 0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(198, 198, 205, 0.5)',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2rem',
        boxShadow: '0 1px 6px rgba(0,0,0,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', textDecoration: 'none' }}>
            <div style={{
              width: 32, height: 32,
              background: '#dc2626',
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>
                shield_with_heart
              </span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.0625rem', letterSpacing: '-0.02em', color: '#0b1c30' }}>
                ResQnet
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.5625rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#64748b',
                lineHeight: 1,
              }}>
                Emergency Response Network
              </div>
            </div>
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: '#e5eeff', padding: '0.35rem 0.75rem',
            borderRadius: 6, border: '1px solid #cce5ff',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>emergency</span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#006398',
            }}>
              Emergency: 112 | Disaster: 1078
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            background: '#eff4ff', padding: '0.35rem 0.65rem',
            borderRadius: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#006398' }}>verified_user</span>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#45464d' }}>
              256-Bit Encrypted
            </span>
          </div>

          <Link
            to="/login"
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 6,
              background: '#fff',
              border: '1px solid #c6c6cd',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#006398',
              textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <span>Sign In</span>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>login</span>
          </Link>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main style={{ flex: 1, padding: '2rem 1rem', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {/* Error notification banner */}
        {error && (
          <div style={{
            background: '#ffdad6', color: '#93000a',
            borderRadius: 8, padding: '0.875rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            border: '1px solid rgba(186,26,26,0.3)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ba1a1a' }}>error</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{error}</span>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            PHASE 1: CHOOSE ACCOUNT TYPE (resqnet_choose_account_type)
           ══════════════════════════════════════════════════════════ */}
        {step === 'choose' && (
          <div>
            <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 2.5rem auto' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: '#e5eeff', padding: '0.35rem 0.9rem', borderRadius: 20,
                marginBottom: '1rem',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>how_to_reg</span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#006398',
                }}>
                  ResQnet Identity Provisioning
                </span>
              </div>

              <h1 style={{
                fontSize: '2.25rem',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: '#0b1c30',
                marginBottom: '0.75rem',
              }}>
                Create your ResQnet account
              </h1>
              <p style={{ fontSize: '1rem', color: '#45464d', lineHeight: 1.6 }}>
                Choose the account type that matches your operational role in the disaster management and emergency response network.
              </p>

              <div style={{
                marginTop: '1.5rem',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#eff4ff', border: '1px solid #dce9ff', borderRadius: 8,
                padding: '0.5rem 1.25rem', gap: '2rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#006398', display: 'inline-block' }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#45464d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Network Status: Live & Ready
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#006398' }}>lock</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', fontWeight: 600, color: '#0b1c30' }}>
                    Tier-4 Encrypted
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Main Role Selection Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2.5rem',
            }}>
              {/* Card 1: Citizen */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                transition: 'all 0.2s',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div style={{
                      width: 52, height: 52,
                      borderRadius: 10,
                      background: '#dce9ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#006398',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 28 }}>family_restroom</span>
                    </div>
                    <span style={{
                      background: '#e5eeff', color: '#00476e',
                      padding: '0.25rem 0.65rem', borderRadius: 20,
                      fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>flash_on</span>
                      Fast Track
                    </span>
                  </div>

                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: '#006398', display: 'block', marginBottom: '0.25rem',
                  }}>
                    Public Safety & Assistance
                  </span>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0b1c30', marginBottom: '0.75rem' }}>
                    Citizen
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: '#45464d', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                    Report emergencies with instant GPS, receive geo-fenced siren alerts, find nearby relief shelters, and track real-time assistance.
                  </p>

                  <div style={{ background: '#f8f9ff', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.6rem' }}>
                      Included Citizen Toolset
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem', color: '#0b1c30' }}>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>Instant automated onboarding</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>One-tap GPS SOS incident reporting</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>Live shelter & safe navigation corridors</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#45464d', fontSize: '0.75rem', marginBottom: '1rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#006398' }}>bolt</span>
                    <span>Immediate account provisioning and dashboard access.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(''); setStep('citizen') }}
                    style={{
                      width: '100%', height: 44,
                      background: '#006398', color: '#fff',
                      border: 'none', borderRadius: 8,
                      fontSize: '0.875rem', fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      boxShadow: '0 2px 6px rgba(0, 99, 152, 0.25)',
                    }}
                  >
                    <span>Register as Citizen</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Coordinator */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                transition: 'all 0.2s',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div style={{
                      width: 52, height: 52,
                      borderRadius: 10,
                      background: '#131b2e',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#ffffff',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 26 }}>radar</span>
                    </div>
                    <span style={{
                      background: '#e5eeff', color: '#006398',
                      padding: '0.25rem 0.65rem', borderRadius: 20,
                      fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>security</span>
                      Command Node
                    </span>
                  </div>

                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: '#006398', display: 'block', marginBottom: '0.25rem',
                  }}>
                    EOC Operations Command
                  </span>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0b1c30', marginBottom: '0.75rem' }}>
                    Coordinator
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: '#45464d', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                    Manage incoming incident triage, dispatch response units, allocate resources, and issue statutory CAP broadcast warnings.
                  </p>

                  <div style={{ background: '#f8f9ff', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.6rem' }}>
                      Included Operations Hub
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem', color: '#0b1c30' }}>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>Multi-district EOC operational cockpit</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>Automated resource allocation engine</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>Statutory CAP alert broadcasting pipeline</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', color: '#45464d', fontSize: '0.75rem', marginBottom: '1rem', minHeight: 36 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398', flexShrink: 0 }}>verified_user</span>
                    <span>Requires official SDMA / DDMA agency credential review.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(''); setStep('coordinator') }}
                    style={{
                      width: '100%', height: 44,
                      background: '#006398', color: '#fff',
                      border: 'none', borderRadius: 8,
                      fontSize: '0.875rem', fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      boxShadow: '0 2px 6px rgba(0, 99, 152, 0.25)',
                    }}
                  >
                    <span>Register as Coordinator</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                  </button>
                </div>
              </div>

              {/* Card 3: Responder / NGO */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                transition: 'all 0.2s',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div style={{
                      width: 52, height: 52,
                      borderRadius: 10,
                      background: '#dce9ff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#006398',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 28 }}>volunteer_activism</span>
                    </div>
                    <span style={{
                      background: '#e5eeff', color: '#006398',
                      padding: '0.25rem 0.65rem', borderRadius: 20,
                      fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>handshake</span>
                      Ground Fleet
                    </span>
                  </div>

                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: '#006398', display: 'block', marginBottom: '0.25rem',
                  }}>
                    Field Missions & Specialized Relief
                  </span>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0b1c30', marginBottom: '0.75rem' }}>
                    NGO / Responder
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: '#45464d', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                    Join emergency operations, accept field rescue missions, mobilize specialized teams and distribute resources.
                  </p>

                  <div style={{ background: '#f8f9ff', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.6rem' }}>
                      Included Mission Toolset
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem', color: '#0b1c30' }}>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>Tactical field mission dispatch receiver</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>Specialized equipment & vehicle roster</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>check_circle</span>
                        <span>Live operational coordination stream</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', color: '#45464d', fontSize: '0.75rem', marginBottom: '1rem', minHeight: 36 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398', flexShrink: 0 }}>policy</span>
                    <span>Statutory NGO / trust registration review required.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(''); setStep('responder') }}
                    style={{
                      width: '100%', height: 44,
                      background: '#006398', color: '#fff',
                      border: 'none', borderRadius: 8,
                      fontSize: '0.875rem', fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      boxShadow: '0 2px 6px rgba(0, 99, 152, 0.25)',
                    }}
                  >
                    <span>Register as NGO / Responder</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Administrator Info Banner */}
            <div style={{
              background: '#eff4ff',
              border: '1px solid #dce9ff',
              borderRadius: 12,
              padding: '1.25rem 1.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem',
              flexWrap: 'wrap',
              marginBottom: '2rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: 44, height: 44,
                  background: '#e5eeff',
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#006398',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24 }}>admin_panel_settings</span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0b1c30', marginBottom: '0.2rem' }}>
                    Are you a System Administrator?
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#45464d', maxWidth: 650 }}>
                    Administrator accounts are provisioned directly by the state command infrastructure and are not available for public registration.
                  </div>
                </div>
              </div>
              <Link
                to="/login"
                style={{
                  color: '#006398',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <span>Admin Sign In</span>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
              </Link>
            </div>

            {/* Bottom Support & Sign-in Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#45464d' }}>
                Already have a ResQnet account?{' '}
                <Link to="/login" style={{ color: '#006398', fontWeight: 700, textDecoration: 'none' }}>
                  Sign In
                </Link>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                fontSize: '0.8125rem', color: '#64748b',
                background: '#fff', padding: '0.4rem 0.85rem', borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398' }}>support_agent</span>
                <span>Helpline: <strong style={{ color: '#0b1c30' }}>1800-180-1078</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            PHASE 2: CITIZEN REGISTRATION (resqnet_citizen_registration)
           ══════════════════════════════════════════════════════════ */}
        {step === 'citizen' && (
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <button
              type="button"
              onClick={() => setStep('choose')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                background: 'none', border: 'none', color: '#006398',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                marginBottom: '1rem', padding: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              <span>Back to Account Selection</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  background: '#e5eeff', color: '#006398',
                  padding: '0.2rem 0.6rem', borderRadius: 4,
                  fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  marginBottom: '0.5rem',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified_user</span>
                  National Disaster Preparedness Network
                </div>
                <h1 style={{ fontSize: '1.875rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0b1c30', margin: 0 }}>
                  Create your Citizen account
                </h1>
                <p style={{ fontSize: '0.875rem', color: '#45464d', marginTop: '0.25rem' }}>
                  Set up your account to report emergencies, receive local warnings, and access community safety hubs.
                </p>
              </div>

              <div style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#006398' }}>cell_tower</span>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5625rem', textTransform: 'uppercase', color: '#64748b' }}>CAP Warning Grid</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                    24x7 Realtime Ready
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleCitizenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Section 1: Personal Info */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#e5eeff', color: '#006398',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                  }}>1</span>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Personal Information</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Identifies you during first responder dispatch and triage</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Full Name *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      placeholder="e.g., Neha Verma"
                      value={citizenName}
                      onChange={e => setCitizenName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Email Address *
                    </label>
                    <input
                      className="input"
                      type="email"
                      required
                      placeholder="neha.verma@domain.in"
                      value={citizenEmail}
                      onChange={e => setCitizenEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Mobile Number *
                    </label>
                    <input
                      className="input"
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={citizenPhone}
                      onChange={e => setCitizenPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Location Details */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', background: '#e5eeff', color: '#006398',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                    }}>2</span>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Location Details</h3>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Calibrates geofenced sirens, flash flood alerts, and shelter mapping</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoDetectLocation}
                    disabled={detectingGps}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      background: '#eff4ff', border: '1px solid #cce5ff', borderRadius: 6,
                      padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: 700,
                      color: '#006398', cursor: 'pointer',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>my_location</span>
                    <span>{detectingGps ? 'Fixing GPS...' : 'Auto Detect'}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Street Address / Landmark *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      placeholder="House/Flat No., Sector, Street or Mohalla"
                      value={citizenStreet}
                      onChange={e => setCitizenStreet(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                        City *
                      </label>
                      <input
                        className="input"
                        type="text"
                        required
                        value={citizenCity}
                        onChange={e => setCitizenCity(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                        State / UT *
                      </label>
                      <select
                        className="input"
                        value={citizenState}
                        onChange={e => setCitizenState(e.target.value)}
                      >
                        <option value="chandigarh">Chandigarh UT</option>
                        <option value="punjab">Punjab</option>
                        <option value="haryana">Haryana</option>
                        <option value="himachal">Himachal Pradesh</option>
                        <option value="delhi">NCT of Delhi</option>
                        <option value="uttarakhand">Uttarakhand</option>
                        <option value="other">Other State / UT</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                        Pincode *
                      </label>
                      <input
                        className="input"
                        type="text"
                        maxLength={6}
                        required
                        value={citizenPincode}
                        onChange={e => setCitizenPincode(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Emergency Contact */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', background: '#e5eeff', color: '#006398',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                    }}>3</span>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Emergency Contact</h3>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Vital next-of-kin line reached during evacuation & medical triage</p>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                    background: '#ffdad6', color: '#93000a', padding: '0.2rem 0.5rem', borderRadius: 4,
                  }}>
                    Mandatory
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Contact Person *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      placeholder="e.g., Rajesh Verma"
                      value={citizenContactName}
                      onChange={e => setCitizenContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Emergency Phone *
                    </label>
                    <input
                      className="input"
                      type="tel"
                      required
                      placeholder="+91 98123 45678"
                      value={citizenContactPhone}
                      onChange={e => setCitizenContactPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Relationship *
                    </label>
                    <select
                      className="input"
                      value={citizenContactRelation}
                      onChange={e => setCitizenContactRelation(e.target.value)}
                    >
                      <option value="parent">Parent</option>
                      <option value="spouse">Spouse</option>
                      <option value="sibling">Sibling</option>
                      <option value="child">Son / Daughter</option>
                      <option value="guardian">Legal Guardian</option>
                      <option value="kin">Other Kin / Neighbor</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 4: Security */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#e5eeff', color: '#006398',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                  }}>4</span>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Account Security</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Protects your citizen profile, medical directives, and SOS history</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Create Password *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="input"
                        type={showCitizenPw ? 'text' : 'password'}
                        required
                        placeholder="Min. 8 characters"
                        value={citizenPassword}
                        onChange={e => setCitizenPassword(e.target.value)}
                        style={{ paddingRight: '2.5rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCitizenPw(!showCitizenPw)}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                          {showCitizenPw ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Confirm Password *
                    </label>
                    <input
                      className="input"
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={citizenConfirmPassword}
                      onChange={e => setCitizenConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ background: '#f8f9ff', padding: '0.75rem 1rem', borderRadius: 6, display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                    Security Requirements:
                  </span>
                  <span style={{ fontSize: '0.75rem', color: citizenPassword.length >= 8 ? '#16a34a' : '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {citizenPassword.length >= 8 ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    8+ Characters
                  </span>
                  <span style={{ fontSize: '0.75rem', color: citizenPassword && citizenPassword === citizenConfirmPassword ? '#16a34a' : '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {citizenPassword && citizenPassword === citizenConfirmPassword ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    Passwords Match
                  </span>
                </div>
              </div>

              {/* Submit Action */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  style={{
                    background: '#fff', border: '1px solid #c6c6cd', borderRadius: 8,
                    padding: '0.75rem 1.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#45464d',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#006398', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '0.75rem 2rem', fontSize: '0.875rem', fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    boxShadow: '0 2px 6px rgba(0,99,152,0.3)',
                  }}
                >
                  {loading ? 'Registering...' : 'Complete Citizen Registration'}
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            PHASE 3: COORDINATOR REGISTRATION (resqnet_coordinator_registration)
           ══════════════════════════════════════════════════════════ */}
        {step === 'coordinator' && (
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <button
              type="button"
              onClick={() => setStep('choose')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                background: 'none', border: 'none', color: '#006398',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                marginBottom: '1rem', padding: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              <span>Back to Account Selection</span>
            </button>

            {/* Tactical Banner */}
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: '1.5rem', marginBottom: '1.5rem',
              display: 'flex', alignItems: 'flex-start', gap: '1rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, background: '#e5eeff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#006398', flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 26 }}>verified_user</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  background: '#dce9ff', color: '#00476e', padding: '0.2rem 0.5rem',
                  borderRadius: 4, fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  marginBottom: '0.35rem',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>security</span>
                  Authorized Personnel Only
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#0b1c30' }}>
                  Register as a Coordinator (EOC)
                </h1>
                <p style={{ fontSize: '0.8125rem', color: '#45464d', margin: '0.25rem 0 0 0', lineHeight: 1.5 }}>
                  Coordinator accounts are for authorized emergency officials and disaster response authorities. Accounts require official verification before operational EOC tools are activated.
                </p>
              </div>
              <div style={{
                background: '#f8f9ff', border: '1px solid #e2e8f0', borderRadius: 6,
                padding: '0.4rem 0.75rem', textAlign: 'right', display: 'none',
              }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', color: '#64748b' }}>PROTOCOL</span>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', fontWeight: 700, color: '#006398' }}>DMA-SEC-2026-V3</div>
              </div>
            </div>

            <form onSubmit={handleCoordinatorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Section 1: Official Identity */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#0b1c30', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                  }}>1</span>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Personal Information</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>EOC primary contact & officer identification</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Full Name & Title *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={coordName}
                      onChange={e => setCoordName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Official Email *
                    </label>
                    <input
                      className="input"
                      type="email"
                      required
                      value={coordEmail}
                      onChange={e => setCoordEmail(e.target.value)}
                    />
                    <span style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                      Must be official department or agency domain
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Mobile / Duty Phone *
                    </label>
                    <input
                      className="input"
                      type="tel"
                      required
                      value={coordPhone}
                      onChange={e => setCoordPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Operational Scope & Jurisdiction */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#0b1c30', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                  }}>2</span>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Organization & Operational Scope</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Command jurisdiction and authorized agency level</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Department / Authority *
                    </label>
                    <select
                      className="input"
                      value={coordDept}
                      onChange={e => setCoordDept(e.target.value)}
                    >
                      <option value="SDMA">State Disaster Management Authority (SDMA)</option>
                      <option value="DDMA">District Disaster Management Authority (DDMA)</option>
                      <option value="NDRF">National Disaster Response Force (NDRF Battalion)</option>
                      <option value="CIVIL_DEFENSE">Civil Defense Corps</option>
                      <option value="FIRE_RESCUE">Municipal Fire & Rescue Services</option>
                      <option value="HEALTH_DEPT">State Directorate of Health & Emergency Care</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Designation *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={coordDesignation}
                      onChange={e => setCoordDesignation(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      State / Territory *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={coordState}
                      onChange={e => setCoordState(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      District / Sector *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={coordDistrict}
                      onChange={e => setCoordDistrict(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Identity & Warrant Verification */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#0b1c30', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                  }}>3</span>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Identity & Warrant Verification</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Statutory credential verification for dispatch authority</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Government Employee / Officer Warrant ID *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={coordGovId}
                      onChange={e => setCoordGovId(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Create Portal Password *
                    </label>
                    <input
                      className="input"
                      type="password"
                      required
                      placeholder="Min. 8 characters"
                      value={coordPassword}
                      onChange={e => setCoordPassword(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Confirm Password *
                    </label>
                    <input
                      className="input"
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={coordConfirmPassword}
                      onChange={e => setCoordConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{
                  background: '#f8f9ff', padding: '0.75rem 1rem', borderRadius: 6,
                  border: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006398', marginTop: 2 }}>info</span>
                  <div style={{ fontSize: '0.75rem', color: '#45464d', lineHeight: 1.5 }}>
                    Upon submitting, your dossier is queued in the <strong>State Command Accreditation Registry</strong>. A reference tracking number will be issued immediately.
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  style={{
                    background: '#fff', border: '1px solid #c6c6cd', borderRadius: 8,
                    padding: '0.75rem 1.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#45464d', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#006398', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '0.75rem 2rem', fontSize: '0.875rem', fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}
                >
                  {loading ? 'Submitting Application...' : 'Submit Coordinator Application'}
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>assignment_turned_in</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            PHASE 4: RESPONDER / NGO (resqnet_ngo_responder_registration)
           ══════════════════════════════════════════════════════════ */}
        {step === 'responder' && (
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <button
              type="button"
              onClick={() => setStep('choose')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                background: 'none', border: 'none', color: '#006398',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                marginBottom: '1rem', padding: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              <span>Back to Account Selection</span>
            </button>

            {/* Header Banner */}
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: '1.5rem', marginBottom: '1.5rem',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
            }}>
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  background: '#e5eeff', color: '#006398', padding: '0.2rem 0.5rem',
                  borderRadius: 4, fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  marginBottom: '0.35rem',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>assured_workload</span>
                  SEOC Statutory Registry • NDMA-REG-2026-B
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#0b1c30' }}>
                  NGO & Response Organization Registration
                </h1>
                <p style={{ fontSize: '0.8125rem', color: '#45464d', margin: '0.25rem 0 0 0' }}>
                  Register your unit to coordinate verified volunteer cohorts, mobilize rescue equipment, and receive field missions.
                </p>
              </div>

              <div style={{
                background: '#f8f9ff', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '0.5rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#006398' }}>verified</span>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5625rem', textTransform: 'uppercase', color: '#64748b' }}>Statutory Standard</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', fontWeight: 700, color: '#0b1c30' }}>DMA Act 2005 Verified</div>
                </div>
              </div>
            </div>

            <form onSubmit={handleResponderSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Section 1: NGO Identity */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#006398', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                  }}>1</span>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Organization Details</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Statutory trust / society registration and primary operating area</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Organization Name *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={ngoOrgName}
                      onChange={e => setNgoOrgName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Registration / Darpan No. *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={ngoRegNo}
                      onChange={e => setNgoRegNo(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Operational Regions / Districts *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={ngoRegion}
                      onChange={e => setNgoRegion(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Certified Active Responders *
                    </label>
                    <input
                      className="input"
                      type="number"
                      required
                      value={ngoHeadcount}
                      onChange={e => setNgoHeadcount(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Lead Officer & Dispatch Contact */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#006398', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                  }}>2</span>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Lead Officer & Duty Dispatch</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Designated contact for receiving coordinator mission task orders</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Lead Officer Name *
                    </label>
                    <input
                      className="input"
                      type="text"
                      required
                      value={ngoLeadName}
                      onChange={e => setNgoLeadName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Official Intake Email *
                    </label>
                    <input
                      className="input"
                      type="email"
                      required
                      value={ngoEmail}
                      onChange={e => setNgoEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Duty Hotline / Mobile *
                    </label>
                    <input
                      className="input"
                      type="tel"
                      required
                      value={ngoPhone}
                      onChange={e => setNgoPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Specialized Capabilities */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#006398', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem',
                  }}>3</span>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0b1c30' }}>Field Capabilities & Credentials</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Select the capabilities your rescue cohort is certified to execute</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  {[
                    'Search & Rescue',
                    'Flood Evacuation',
                    'Medical Auxiliary',
                    'Logistics & Relief',
                    'Heavy Machinery',
                    'Animal / Livestock Rescue',
                  ].map(cap => {
                    const isSelected = ngoSpecializations.includes(cap)
                    return (
                      <div
                        key={cap}
                        onClick={() => {
                          if (isSelected) {
                            setNgoSpecializations(ngoSpecializations.filter(s => s !== cap))
                          } else {
                            setNgoSpecializations([...ngoSpecializations, cap])
                          }
                        }}
                        style={{
                          padding: '0.65rem 0.85rem',
                          borderRadius: 6,
                          border: `1px solid ${isSelected ? '#006398' : '#e2e8f0'}`,
                          background: isSelected ? '#eff4ff' : '#fff',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: isSelected ? '#006398' : '#94a3b8' }}>
                          {isSelected ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <span style={{ fontSize: '0.8125rem', fontWeight: isSelected ? 700 : 500, color: '#0b1c30' }}>
                          {cap}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Password Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Portal Access Password *
                    </label>
                    <input
                      className="input"
                      type="password"
                      required
                      placeholder="Min. 8 characters"
                      value={ngoPassword}
                      onChange={e => setNgoPassword(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#45464d', marginBottom: '0.35rem' }}>
                      Confirm Password *
                    </label>
                    <input
                      className="input"
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={ngoConfirmPassword}
                      onChange={e => setNgoConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  style={{
                    background: '#fff', border: '1px solid #c6c6cd', borderRadius: 8,
                    padding: '0.75rem 1.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#45464d', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#006398', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '0.75rem 2rem', fontSize: '0.875rem', fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}
                >
                  {loading ? 'Submitting Application...' : 'Submit Organization Dossier'}
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            PHASE 5: REGISTRATION SUBMITTED & VERIFICATION PENDING
            (resqnet_verification_pending + resqnet_registration_submitted)
           ══════════════════════════════════════════════════════════ */}
        {step === 'submitted' && submittedDocket && (
          <div style={{ maxWidth: 780, margin: '0 auto' }}>
            {/* Top Telemetry Strip */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#e5eeff', padding: '0.5rem 1rem', borderRadius: 8,
              marginBottom: '1.5rem', fontSize: '0.6875rem', fontFamily: "'JetBrains Mono', monospace",
              color: '#00476e', flexWrap: 'wrap', gap: '0.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#006398', display: 'inline-block' }} />
                <span>SYS.VERIFY.PROTOCOL // REG-STAGE-02</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <span>ENCRYPTION: AES-GCM-256</span>
                <span style={{ color: '#006398', fontWeight: 700 }}>STATUS: QUEUED</span>
              </div>
            </div>

            {/* Main Cockpit Card */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            }}>
              {/* Header Status Ring */}
              <div style={{
                background: 'linear-gradient(180deg, #eff4ff 0%, #ffffff 100%)',
                padding: '2.5rem 2rem 2rem 2rem',
                textAlign: 'center',
                borderBottom: '1px solid #f1f5f9',
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: '#fef3c7',
                  margin: '0 auto 1.25rem auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#d97706' }}>
                    hourglass_top
                  </span>
                </div>

                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  background: '#fef3c7', color: '#92400e',
                  padding: '0.25rem 0.75rem', borderRadius: 20,
                  fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  marginBottom: '0.75rem',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>pending_actions</span>
                  Under Administrative Review
                </div>

                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0b1c30', margin: '0 0 0.5rem 0' }}>
                  Registration Submitted Successfully
                </h1>
                <p style={{ fontSize: '0.9375rem', color: '#64748b', maxWidth: 540, margin: '0 auto', lineHeight: 1.5 }}>
                  Your official dossier has been lodged into the State Emergency Operations Center (SEOC) verified intake registry.
                </p>

                <div style={{
                  marginTop: '1.25rem',
                  display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                  background: '#f1f5f9', padding: '0.35rem 0.85rem', borderRadius: 20,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#45464d',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#006398', display: 'inline-block' }} />
                  <span>Current EOC Queue Latency:</span>
                  <strong style={{ color: '#006398' }}>~24–48 hours</strong>
                </div>
              </div>

              {/* Dossier Overview Table */}
              <div style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
                    Application Dossier Overview
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 700, color: '#006398' }}>
                      {submittedDocket.referenceId}
                    </span>
                    <button
                      type="button"
                      onClick={copyRefId}
                      style={{
                        background: '#eff4ff', border: '1px solid #cce5ff', borderRadius: 4,
                        padding: '0.2rem 0.5rem', fontSize: '0.6875rem', fontWeight: 600, color: '#006398',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>content_copy</span>
                      <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div style={{
                  background: '#f8f9ff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '1.25rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1rem',
                  marginBottom: '2rem',
                }}>
                  <div>
                    <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em' }}>
                      Account Type
                    </div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0b1c30', marginTop: 2 }}>
                      {submittedDocket.role}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em' }}>
                      Designated Entity
                    </div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0b1c30', marginTop: 2 }}>
                      {submittedDocket.entityName}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em' }}>
                      Applicant / Lead Officer
                    </div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0b1c30', marginTop: 2 }}>
                      {submittedDocket.applicantName}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em' }}>
                      Submission Timestamp
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', color: '#45464d', marginTop: 2 }}>
                      {submittedDocket.submittedAt}
                    </div>
                  </div>
                </div>

                {/* Clearance Pipeline Progress */}
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', marginBottom: '1rem' }}>
                    Statutory Clearance Pipeline
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#16a34a' }}>check_circle</span>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: '#16a34a' }}>Step 1 • Passed</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0b1c30' }}>Intake Recorded</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>Encrypted dossier deposited</div>
                    </div>

                    <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: 8, padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ca8a04' }}>sync</span>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: '#ca8a04' }}>Step 2 • Active</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0b1c30' }}>Deputation Review</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>SDMA gazetted vetting in progress</div>
                    </div>

                    <div style={{ background: '#f8f9ff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', opacity: 0.7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#94a3b8' }}>lock</span>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8' }}>Step 3 • Queued</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0b1c30' }}>Command Activation</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>Tactical GIS & CAD clearance issued</div>
                    </div>
                  </div>
                </div>

                {/* Urgent Escalation Advisory */}
                <div style={{
                  background: '#f1f5f9', borderRadius: 8, padding: '1rem 1.25rem',
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '2rem',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#006398', marginTop: 2 }}>priority_high</span>
                  <div style={{ fontSize: '0.8125rem', color: '#45464d', lineHeight: 1.5 }}>
                    <strong style={{ color: '#0b1c30' }}>Active Emergency Expedited Clearance:</strong> If your deployment is urgent due to an active Level-2/3 disaster warning, contact the State Emergency Operations Centre (SEOC) priority desk at <strong>011-2670-1700</strong> quoting reference <strong>{submittedDocket.referenceId}</strong>.
                  </div>
                </div>

                {/* Return Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    style={{
                      background: '#fff', border: '1px solid #c6c6cd', borderRadius: 8,
                      padding: '0.75rem 1.5rem', fontSize: '0.875rem', fontWeight: 700, color: '#0b1c30',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                    <span>Print / Save Docket</span>
                  </button>

                  <Link
                    to="/login"
                    style={{
                      background: '#006398', color: '#fff', textDecoration: 'none',
                      borderRadius: 8, padding: '0.75rem 2rem', fontSize: '0.875rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                    <span>Return to Sign In</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        background: '#eff4ff', borderTop: '1px solid #e2e8f0',
        padding: '1rem 2rem', marginTop: 'auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#64748b' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#006398' }}>shield</span>
          © 2026 ResQnet. Centralized Disaster Management & Emergency Response Network
        </div>
        <nav style={{ display: 'flex', gap: '1.25rem' }}>
          {['Disaster Guidelines', 'Privacy Policy', 'Terms of Service', 'EOC Directory'].map(link => (
            <a key={link} href="#" style={{ fontSize: '0.75rem', color: '#64748b', textDecoration: 'none' }}>
              {link}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  )
}

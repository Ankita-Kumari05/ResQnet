// BottomSheet — accessible slide-up drawer component
// Used by Citizen Dashboard for hub list, route summary, and report form
import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxHeight?: string
}

export function BottomSheet({ isOpen, onClose, title, children, maxHeight = '70vh' }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  // Trap focus and handle keyboard
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    // Focus the sheet when opened
    sheetRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="bottom-sheet-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="bottom-sheet"
        style={{ maxHeight }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="bottom-sheet-header">
          <h3 style={{ fontSize: '0.95rem', margin: 0 }}>{title}</h3>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </div>
        <div className="bottom-sheet-content">
          {children}
        </div>
      </div>
    </>
  )
}

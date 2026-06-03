import React from 'react'

interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
}

const defaultProps = { size: 24, color: 'currentColor', strokeWidth: 1.8 }

function svg(props: IconProps, children: React.ReactNode) {
  const p = { ...defaultProps, ...props }
  return (
    <svg width={p.size} height={p.size} viewBox="0 0 24 24" fill="none"
      stroke={p.color} strokeWidth={p.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export const Home = (p: IconProps) => svg(p, <>
  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  <polyline points="9 22 9 12 15 12 15 22" />
</>)

export const Camera = (p: IconProps) => svg(p, <>
  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
  <circle cx="12" cy="13" r="4" />
</>)

export const Edit = (p: IconProps) => svg(p, <>
  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
</>)

export const History = (p: IconProps) => svg(p, <>
  <circle cx="12" cy="12" r="10" />
  <polyline points="12 6 12 12 16 14" />
</>)

export const Receipt = (p: IconProps) => svg(p, <>
  <path d="M4 2v20l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5V2l-2 1.5L12 2l-2 1.5L8 2 6 3.5z" />
  <line x1="8" y1="8" x2="16" y2="8" />
  <line x1="8" y1="12" x2="16" y2="12" />
  <line x1="8" y1="16" x2="12" y2="16" />
</>)

export const Download = (p: IconProps) => svg(p, <>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  <polyline points="7 10 12 15 17 10" />
  <line x1="12" y1="15" x2="12" y2="3" />
</>)

export const Mail = (p: IconProps) => svg(p, <>
  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
  <polyline points="22,6 12,13 2,6" />
</>)

export const File = (p: IconProps) => svg(p, <>
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  <polyline points="14 2 14 8 20 8" />
  <line x1="16" y1="13" x2="8" y2="13" />
  <line x1="16" y1="17" x2="8" y2="17" />
</>)

export const ArrowLeft = (p: IconProps) => svg(p, <>
  <line x1="19" y1="12" x2="5" y2="12" />
  <polyline points="12 19 5 12 12 5" />
</>)

export const ChevronLeft = (p: IconProps) => svg(p, <polyline points="15 18 9 12 15 6" />)
export const ChevronRight = (p: IconProps) => svg(p, <polyline points="9 18 15 12 9 6" />)

export const DollarSign = (p: IconProps) => svg(p, <>
  <line x1="12" y1="1" x2="12" y2="23" />
  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
</>)

export const TrendingUp = (p: IconProps) => svg(p, <>
  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
  <polyline points="17 6 23 6 23 12" />
</>)

export const AlertTriangle = (p: IconProps) => svg(p, <>
  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
  <line x1="12" y1="9" x2="12" y2="13" />
  <line x1="12" y1="17" x2="12.01" y2="17" />
</>)

export const Calendar = (p: IconProps) => svg(p, <>
  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
  <line x1="16" y1="2" x2="16" y2="6" />
  <line x1="8" y1="2" x2="8" y2="6" />
  <line x1="3" y1="10" x2="21" y2="10" />
</>)

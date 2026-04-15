import React from 'react'

export const BrandMark: React.FC<{
  primary: string
  size?: number
  style?: React.CSSProperties
}> = ({ primary, size = 34, style }) => {
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 900,
        letterSpacing: '-0.03em',
        color: 'rgba(236,243,255,0.92)',
        ...style
      }}
    >
      Auto<span style={{ color: primary }}>Whats</span>
    </div>
  )
}


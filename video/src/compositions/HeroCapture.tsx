import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion'
import type { HeroCaptureProps } from '../types'

export const HeroCapture: React.FC<HeroCaptureProps> = ({ src }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0D1117' }}>
      <OffthreadVideo
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
        muted
      />
    </AbsoluteFill>
  )
}

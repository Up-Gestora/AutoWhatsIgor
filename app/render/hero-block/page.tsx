import { HeroV2Visual } from '@/components/marketing-v2/hero-v2'

export default function RenderHeroBlockPage() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-[#0D1117] flex items-center justify-center">
      <div
        data-testid="hero-block-capture-canvas"
        className="relative w-[1080px] h-[1920px] overflow-hidden bg-[#0D1117]"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.55]"
            style={{
              background:
                'radial-gradient(1200px 600px at 20% 10%, rgba(37,211,102,0.22), transparent 60%), radial-gradient(900px 500px at 80% 30%, rgba(7,94,84,0.18), transparent 55%), radial-gradient(900px 600px at 50% 90%, rgba(52,232,121,0.10), transparent 65%)'
            }}
          />
          <div className="absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center px-14">
          <HeroV2Visual
            testId="hero-block-capture-target"
            animatedDemo
            parallax={false}
            className="w-full max-w-[760px] [transform:scale(1.12)] [transform-origin:center]"
          />
        </div>
      </div>
    </main>
  )
}

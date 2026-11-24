import { useEffect, useState } from 'react'

// Which version of Lucie this browser is running, plus the window size it sees. Handy when
// someone sends a screenshot of a layout problem: it shows whether they have the latest deploy
// and how much room the page actually has.
export default function BuildStamp() {
  const [size, setSize] = useState(() => `${window.innerWidth}×${window.innerHeight}`)
  useEffect(() => {
    const update = () => setSize(`${window.innerWidth}×${window.innerHeight}`)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return <p className="px-4 pb-2 text-[10px] text-slate-500" title="Version and window size, for support">Build {__BUILD_ID__} · {size}</p>
}

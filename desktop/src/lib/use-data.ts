import { useCallback, useEffect, useRef, useState } from 'react'

/** Load data once (and optionally every `pollMs`), with manual reload. */
export function useData<T>(load: () => Promise<T>, pollMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await loadRef.current())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    if (!pollMs) return
    const id = setInterval(reload, pollMs)
    return () => clearInterval(id)
  }, [reload, pollMs])

  return { data, error, loading, reload, setData }
}

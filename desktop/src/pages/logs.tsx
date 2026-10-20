import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { api } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ActionButton, ErrorBox, PageHeader } from '@/components/common'
import { cn } from '@/lib/utils'

const isError = (l: string) => /error|failed|rejected|unauthorized|lỗi|exiting|duplicate/i.test(l)

export function LogsPage() {
  const log = useData(() => api.serviceLog(400), 5000)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => (log.data ?? []).filter((l) => !onlyErrors || isError(l)), [log.data, onlyErrors])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [lines.length])

  return (
    <>
      <PageHeader
        title='Nhật ký dịch vụ'
        description='400 dòng gần nhất, tự cập nhật mỗi 5 giây. Mã bí mật được che.'
        actions={
          <>
            <label className='flex items-center gap-2 text-sm'>
              <Switch checked={onlyErrors} onCheckedChange={setOnlyErrors} /> Chỉ lỗi
            </label>
            <ActionButton variant='outline' onRun={() => api.openLogs()}>
              <FolderOpen /> Mở thư mục log
            </ActionButton>
          </>
        }
      />
      <main className='p-6'>
        {log.error && <ErrorBox message={log.error} />}
        <Card className='bg-zinc-950 py-0 text-zinc-100 dark:bg-zinc-900'>
          <div className='h-[calc(100svh-11rem)] overflow-auto p-4 font-mono text-xs leading-relaxed'>
            {lines.map((l, i) => (
              <div key={i} className={cn('whitespace-pre-wrap', isError(l) && 'text-red-400')}>
                {l}
              </div>
            ))}
            {log.data && lines.length === 0 && <div className='text-zinc-500'>Không có dòng nào.</div>}
            <div ref={end} />
          </div>
        </Card>
      </main>
    </>
  )
}

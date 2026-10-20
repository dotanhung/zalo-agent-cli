import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Save, Search, Users, User } from 'lucide-react'
import { toast } from 'sonner'
import { api, type PublicConfig, type Thread } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ActionButton, ErrorBox, PageHeader } from '@/components/common'

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

const key = (t: { type: string; threadId: string }) => `${t.type}:${t.threadId}`

type Draft = { watch: Set<string>; send: Set<string>; readOnly: boolean }

function draftFrom(cfg: PublicConfig): Draft {
  return {
    watch: new Set(cfg.watchThreads),
    send: new Set(cfg.sendThreads ?? cfg.watchThreads),
    readOnly: cfg.readOnly,
  }
}

const has = (set: Set<string>, t: Thread) => set.has(key(t)) || set.has(`${t.type}:*`)

export function GroupsPage() {
  const threads = useData(api.threads)
  const config = useData(api.config)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'group' | 'dm' | 'watched'>('group')

  useEffect(() => {
    if (config.data) setDraft(draftFrom(config.data))
  }, [config.data])

  const rows = useMemo(() => {
    const list = threads.data ?? []
    const f = fold(q.trim())
    return list.filter((t) => {
      if (tab === 'watched' ? !(draft && has(draft.watch, t)) : t.type !== tab) return false
      return !f || fold(t.name).includes(f) || t.threadId.includes(f)
    })
  }, [threads.data, q, tab, draft])

  const original = config.data ? draftFrom(config.data) : null
  const dirty =
    draft &&
    original &&
    (JSON.stringify([...draft.watch].sort()) !== JSON.stringify([...original.watch].sort()) ||
      JSON.stringify([...draft.send].sort()) !== JSON.stringify([...original.send].sort()))

  const toggle = (which: 'watch' | 'send', t: Thread, on: boolean) => {
    if (!draft) return
    const watch = new Set(draft.watch)
    const send = new Set(draft.send)
    const k = key(t)
    if (which === 'watch') {
      on ? watch.add(k) : watch.delete(k)
      if (!on) send.delete(k) // cannot send to an unwatched thread
    } else {
      on ? send.add(k) : send.delete(k)
      if (on) watch.add(k)
    }
    setDraft({ ...draft, watch, send })
  }

  const toggleAll = (which: 'watch' | 'send', type: 'group' | 'dm', on: boolean) => {
    if (!draft) return
    const watch = new Set(draft.watch)
    const send = new Set(draft.send)
    const k = `${type}:*`
    if (which === 'watch') {
      on ? watch.add(k) : watch.delete(k)
      if (!on) send.delete(k)
    } else {
      on ? send.add(k) : send.delete(k)
      if (on) watch.add(k)
    }
    setDraft({ ...draft, watch, send })
  }

  const save = async () => {
    if (!draft) return
    const r = await api.saveAccess({ watchThreads: [...draft.watch], sendThreads: [...draft.send], readOnly: draft.readOnly })
    if (r.restart.ok) toast.success('Đã lưu và khởi động lại dịch vụ', { description: r.backup ? `Bản cũ lưu tại ${r.backup}` : undefined })
    else toast.warning('Đã lưu, nhưng khởi động lại dịch vụ chưa thành công', { description: r.restart.output.slice(-300) })
    config.reload()
    threads.reload()
  }

  const newSendTargets = draft && original ? [...draft.send].filter((s) => !original.send.has(s)) : []

  return (
    <>
      <PageHeader
        title='Nhóm theo dõi'
        description='Chọn nhóm/bạn bè được ghi vào Sheet (Theo dõi) và được AI gửi tin (Được gửi)'
        actions={
          <>
            <Button variant='ghost' disabled={!dirty} onClick={() => original && setDraft(original)}>
              <RotateCcw /> Hoàn tác
            </Button>
            <ActionButton
              disabled={!dirty}
              onRun={save}
              confirm={{
                title: 'Lưu thay đổi?',
                description:
                  `Dịch vụ Zalo sẽ khởi động lại (ngắt 10–30 giây).` +
                  (newSendTargets.length && !draft?.readOnly
                    ? `\n\n⚠️ Bạn đang CHO PHÉP AI GỬI TIN vào ${newSendTargets.length} cuộc trò chuyện mới.`
                    : '') +
                  (draft?.readOnly ? '\n\nChế độ Chỉ đọc đang BẬT — AI vẫn chưa gửi được tin dù đã tick “Được gửi”.' : ''),
                action: 'Lưu',
              }}
            >
              <Save /> Lưu
            </ActionButton>
          </>
        }
      />
      <main className='space-y-4 p-6'>
        {threads.error && <ErrorBox message={threads.error} />}
        {config.error && <ErrorBox message={config.error} />}

        {draft && (
          <Card>
            <CardHeader>
              <CardTitle>Theo dõi tất cả</CardTitle>
              <CardDescription>Bật khi muốn ghi mọi nhóm (kể cả nhóm mới vào sau). Thường nên tắt và chọn từng nhóm.</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-wrap gap-6'>
              {(['group', 'dm'] as const).map((type) => (
                <label key={type} className='flex items-center gap-2 text-sm'>
                  <Switch checked={draft.watch.has(`${type}:*`)} onCheckedChange={(on) => toggleAll('watch', type, on)} />
                  Theo dõi mọi {type === 'group' ? 'nhóm' : 'tin nhắn riêng'}
                </label>
              ))}
            </CardContent>
          </Card>
        )}

        <div className='flex flex-wrap items-center gap-3'>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value='group'>
                <Users /> Nhóm
              </TabsTrigger>
              <TabsTrigger value='dm'>
                <User /> Bạn bè
              </TabsTrigger>
              <TabsTrigger value='watched'>Đang theo dõi</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className='relative min-w-60 flex-1'>
            <Search className='absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input className='pl-8' placeholder='Tìm theo tên (gõ không dấu cũng được)…' value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {dirty && <Badge variant='secondary'>Có thay đổi chưa lưu</Badge>}
        </div>

        <Card className='py-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead className='w-28'>Thành viên</TableHead>
                <TableHead className='w-28 text-center'>Theo dõi</TableHead>
                <TableHead className='w-28 text-center'>Được gửi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {threads.loading && !threads.data
                ? [0, 1, 2, 3, 4].map((i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={4}>
                        <Skeleton className='h-6' />
                      </TableCell>
                    </TableRow>
                  ))
                : rows.map((t) => {
                    const w = draft ? has(draft.watch, t) : t.watched
                    const s = draft ? has(draft.send, t) : t.sendable
                    const wildW = draft?.watch.has(`${t.type}:*`)
                    const wildS = draft?.send.has(`${t.type}:*`)
                    return (
                      <TableRow key={key(t)} data-state={w ? 'selected' : undefined}>
                        <TableCell>
                          <div className='font-medium'>{t.name}</div>
                          <div className='text-xs text-muted-foreground'>{t.threadId}</div>
                        </TableCell>
                        <TableCell className='text-muted-foreground'>{t.type === 'group' ? (t.memberCount ?? '—') : '—'}</TableCell>
                        <TableCell className='text-center'>
                          <Checkbox checked={w} disabled={wildW} onCheckedChange={(on) => toggle('watch', t, on === true)} aria-label='Theo dõi' />
                        </TableCell>
                        <TableCell className='text-center'>
                          <Checkbox checked={s} disabled={wildS} onCheckedChange={(on) => toggle('send', t, on === true)} aria-label='Được gửi' />
                        </TableCell>
                      </TableRow>
                    )
                  })}
              {threads.data && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className='py-10 text-center text-muted-foreground'>
                    Không có kết quả.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </main>
    </>
  )
}

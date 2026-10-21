import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Save, Search, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api, type PublicConfig, type Thread } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActionButton, ErrorBox, PageHeader } from '@/components/common'

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

type Kind = 'group' | 'dm'
const key = (type: string, id: string) => `${type}:${id}`

/**
 * Editable copy of the access rules. `sendNull` keeps the config's "sendThreads: null"
 * (= same as watchThreads) until the user touches a "Được gửi" box.
 */
type Draft = { watch: Set<string>; send: Set<string>; sendNull: boolean; readOnly: boolean }

function draftFrom(cfg: PublicConfig): Draft {
  return {
    watch: new Set(cfg.watchThreads),
    send: new Set(cfg.sendThreads ?? []),
    sendNull: cfg.sendThreads === null,
    readOnly: cfg.readOnly,
  }
}

const covered = (set: Set<string>, type: string, id: string) => set.has(key(type, id)) || set.has(`${type}:*`)

type Row = { threadId: string; type: Kind; name: string | null; memberCount?: number }

export function GroupsPage() {
  const threads = useData(api.threads)
  const config = useData(api.config)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Kind>('group')
  const [newId, setNewId] = useState('')
  // A thread waiting for its own "allow AI to send here?" confirmation
  const [grant, setGrant] = useState<Row | null>(null)

  useEffect(() => {
    if (config.data) setDraft(draftFrom(config.data))
  }, [config.data])

  const original = config.data ? draftFrom(config.data) : null
  // Read-only = nothing is sent (the panel saves sendThreads as [])
  const effSend = (d: Draft) => (d.readOnly ? new Set<string>() : d.sendNull ? d.watch : d.send)

  // Rows = watched threads the service knows (with names) + IDs added here but not saved yet
  const rows = useMemo<Row[]>(() => {
    const known: Row[] = (threads.data ?? []).map((t: Thread) => ({ ...t }))
    const seen = new Set(known.map((t) => key(t.type, t.threadId)))
    const pending: Row[] = draft
      ? [...draft.watch]
          .filter((k) => !k.endsWith(':*') && !seen.has(k))
          .map((k) => {
            const [type, threadId] = k.split(':') as [Kind, string]
            return { type, threadId, name: null }
          })
      : []
    const f = fold(q.trim())
    return [...known, ...pending].filter(
      (t) => t.type === tab && (!f || fold(t.name ?? '').includes(f) || t.threadId.includes(f))
    )
  }, [threads.data, draft, q, tab])

  const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))
  const dirty =
    !!draft &&
    !!original &&
    (!sameSet(draft.watch, original.watch) ||
      draft.sendNull !== original.sendNull ||
      (!draft.sendNull && !sameSet(draft.send, original.send)))

  const toggleWatch = (type: Kind, id: string, on: boolean) => {
    if (!draft) return
    const watch = new Set(draft.watch)
    const send = new Set(draft.send)
    const k = key(type, id)
    if (on) watch.add(k)
    else {
      watch.delete(k)
      send.delete(k) // cannot send to an unwatched thread
    }
    setDraft({ ...draft, watch, send })
  }

  const toggleSend = (type: Kind, id: string, on: boolean) => {
    if (!draft || draft.readOnly) return
    // First edit of a "same as watched" config: materialise it so the change is explicit
    const send = new Set(draft.sendNull ? draft.watch : draft.send)
    const k = key(type, id)
    if (on) send.add(k)
    else send.delete(k)
    setDraft({ ...draft, send, sendNull: false })
  }

  // Granting send is never a plain tick: it goes through its own confirmation dialog
  const requestSend = (t: Row, on: boolean) => {
    if (on) setGrant(t)
    else toggleSend(t.type, t.threadId, false)
  }

  const toggleWatchAll = (type: Kind, on: boolean) => {
    if (!draft) return
    const watch = new Set(draft.watch)
    const send = new Set(draft.send)
    if (on) watch.add(`${type}:*`)
    else {
      watch.delete(`${type}:*`)
      send.delete(`${type}:*`)
    }
    setDraft({ ...draft, watch, send })
  }

  const addById = () => {
    const id = newId.trim()
    if (!/^[0-9]{5,25}$/.test(id)) {
      toast.error('Mã không hợp lệ — chỉ gồm chữ số (xem mã trong link/nhật ký Zalo).')
      return
    }
    toggleWatch(tab, id, true)
    setNewId('')
    toast.info('Đã thêm vào danh sách — bấm Lưu để áp dụng, tên sẽ hiện sau khi dịch vụ khởi động lại.')
  }

  const save = async () => {
    if (!draft) return
    try {
      const r = await api.saveAccess({
        watchThreads: [...draft.watch],
        sendThreads: draft.sendNull ? null : [...draft.send],
        readOnly: draft.readOnly,
      })
      if (r.restart.ok)
        toast.success('Đã lưu và khởi động lại dịch vụ', { description: r.backup ? `Bản cũ lưu tại ${r.backup}` : undefined })
      else toast.warning('Đã lưu, nhưng khởi động lại dịch vụ chưa thành công', { description: r.restart.output.slice(-300) })
    } catch (e) {
      toast.error((e as Error).message)
    }
    config.reload()
    threads.reload()
  }

  const newSendTargets =
    draft && original ? [...effSend(draft)].filter((s) => !effSend(original).has(s)) : []

  return (
    <>
      <PageHeader
        title='Nhóm theo dõi'
        description='Nhóm/bạn bè được ghi vào Sheet (Theo dõi) và được AI gửi tin (Được gửi)'
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
                  'Dịch vụ Zalo sẽ khởi động lại (ngắt 10–30 giây).' +
                  (newSendTargets.length && !draft?.readOnly
                    ? `\n\n⚠️ Bạn đang CHO PHÉP AI GỬI TIN vào ${newSendTargets.length} cuộc trò chuyện mới.`
                    : ''),
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

        <div className='grid gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Thêm nhóm / người theo dõi</CardTitle>
              <CardDescription>
                Vì an toàn, phần mềm chỉ thấy các cuộc trò chuyện đang được theo dõi. Thêm mới bằng mã (dãy số) của nhóm/người.
              </CardDescription>
            </CardHeader>
            <CardContent className='flex gap-2'>
              <Input
                placeholder={tab === 'group' ? 'Mã nhóm, ví dụ 9115874644608778682' : 'Mã người dùng'}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addById()}
              />
              <Button variant='outline' onClick={addById} disabled={!newId.trim()}>
                <Plus /> Thêm {tab === 'group' ? 'nhóm' : 'người'}
              </Button>
            </CardContent>
          </Card>

          {draft && (
            <Card>
              <CardHeader>
                <CardTitle>Theo dõi tất cả</CardTitle>
                <CardDescription>Ghi mọi nhóm/tin riêng vào Sheet (kể cả nhóm mới). Không bật quyền gửi tin.</CardDescription>
              </CardHeader>
              <CardContent className='flex flex-wrap gap-6'>
                {(['group', 'dm'] as const).map((type) => (
                  <label key={type} className='flex items-center gap-2 text-sm'>
                    <Switch checked={draft.watch.has(`${type}:*`)} onCheckedChange={(on) => toggleWatchAll(type, on)} />
                    Theo dõi mọi {type === 'group' ? 'nhóm' : 'tin nhắn riêng'}
                  </label>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className='flex flex-wrap items-center gap-3'>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
            <TabsList>
              <TabsTrigger value='group'>
                <Users /> Nhóm
              </TabsTrigger>
              <TabsTrigger value='dm'>
                <User /> Bạn bè
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className='relative min-w-60 flex-1'>
            <Search className='absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input className='pl-8' placeholder='Tìm theo tên (gõ không dấu cũng được)…' value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {dirty && <Badge variant='secondary'>Có thay đổi chưa lưu</Badge>}
        </div>

        {draft?.readOnly && (
          <p className='text-sm text-muted-foreground'>
            Chế độ Chỉ đọc đang BẬT — cột “Được gửi” bị khoá, AI không gửi tin vào nhóm nào. Muốn cho gửi: tắt Chỉ đọc ở trang An
            toàn, rồi tick từng nhóm và xác nhận.
          </p>
        )}

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
                ? [0, 1, 2].map((i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={4}>
                        <Skeleton className='h-6' />
                      </TableCell>
                    </TableRow>
                  ))
                : rows.map((t) => {
                    const w = draft ? covered(draft.watch, t.type, t.threadId) : true
                    const s = draft ? covered(effSend(draft), t.type, t.threadId) : false
                    return (
                      <TableRow key={key(t.type, t.threadId)} data-state={w ? 'selected' : undefined}>
                        <TableCell>
                          <div className='font-medium'>{t.name ?? <span className='text-muted-foreground italic'>Chưa có tên — lưu để cập nhật</span>}</div>
                          <div className='text-xs text-muted-foreground'>{t.threadId}</div>
                        </TableCell>
                        <TableCell className='text-muted-foreground'>{t.type === 'group' ? (t.memberCount ?? '—') : '—'}</TableCell>
                        <TableCell className='text-center'>
                          <Checkbox
                            checked={w}
                            disabled={draft?.watch.has(`${t.type}:*`)}
                            onCheckedChange={(on) => toggleWatch(t.type, t.threadId, on === true)}
                            aria-label='Theo dõi'
                          />
                        </TableCell>
                        <TableCell className='text-center'>
                          <Checkbox
                            checked={s}
                            disabled={!w || !draft || draft.readOnly || effSend(draft).has(`${t.type}:*`)}
                            onCheckedChange={(on) => requestSend(t, on === true)}
                            aria-label='Được gửi'
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
              {threads.data && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className='py-10 text-center text-muted-foreground'>
                    Chưa theo dõi {tab === 'group' ? 'nhóm' : 'người'} nào{q ? ' khớp từ khoá' : ''}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </main>

      <AlertDialog open={!!grant} onOpenChange={(open) => !open && setGrant(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cho phép AI GỬI TIN vào cuộc trò chuyện này?</AlertDialogTitle>
            <AlertDialogDescription className='whitespace-pre-wrap'>
              {`${grant?.name ?? 'Chưa có tên'} (${grant?.type === 'group' ? 'nhóm' : 'tin riêng'} ${grant?.threadId ?? ''})\n\n` +
                'AI sẽ gửi được tin Zalo thật vào đây, thay mặt tài khoản này. Mỗi lần gửi đều ghi nhật ký ở trang An toàn.\n' +
                'Quyền chỉ có hiệu lực sau khi bấm Lưu.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Không cho gửi</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (grant) toggleSend(grant.type, grant.threadId, true)
                setGrant(null)
              }}
            >
              Cho phép gửi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

import { Bot, FileSpreadsheet, MessageCircle, RefreshCw, Server } from 'lucide-react'
import { toast } from 'sonner'
import { api, ago, duration, isAdmin } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ActionButton, ErrorBox, PageHeader, StatusPill, type Level } from '@/components/common'
import type { Page } from '@/App'

function Tile({
  icon: Icon,
  title,
  level,
  label,
  children,
}: {
  icon: React.ElementType
  title: string
  level: Level
  label: string
  children: React.ReactNode
}) {
  return (
    <Card className='gap-4'>
      <CardHeader className='flex flex-row items-center gap-3'>
        <div className='grid size-10 place-items-center rounded-lg bg-primary/10 text-primary'>
          <Icon className='size-5' />
        </div>
        <div className='flex-1'>
          <CardTitle className='text-base'>{title}</CardTitle>
        </div>
        <StatusPill level={level}>{label}</StatusPill>
      </CardHeader>
      <CardContent className='space-y-1.5 text-sm text-muted-foreground'>{children}</CardContent>
    </Card>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className='flex justify-between gap-4'>
      <span>{k}</span>
      <span className='text-right font-medium text-foreground'>{v}</span>
    </div>
  )
}

export function OverviewPage({ go }: { go: (p: Page) => void }) {
  const status = useData(api.status, 10000)
  const claude = useData(api.claudeStatus, 60000)
  const s = status.data
  const a = s && isAdmin(s.admin) ? s.admin : null

  const sheetsLevel: Level = !a?.sheets.enabled
    ? 'idle'
    : a.sheets.lastFailAt && (!a.sheets.lastOkAt || a.sheets.lastFailAt > a.sheets.lastOkAt)
      ? 'error'
      : 'ok'

  return (
    <>
      <PageHeader
        title='Tổng quan'
        description='Trạng thái Zalo, Google Sheet và Claude — tự cập nhật mỗi 10 giây'
        actions={
          <ActionButton
            variant='outline'
            onRun={async () => {
              const r = await api.restartService()
              if (r.ok) toast.success('Đã khởi động lại dịch vụ Zalo')
              else toast.error('Khởi động lại không thành công', { description: r.output.slice(-300) })
              status.reload()
            }}
            confirm={{
              title: 'Khởi động lại dịch vụ Zalo?',
              description: 'Zalo sẽ tạm ngắt khoảng 10–30 giây. Tin đến trong lúc đó vẫn được ghi bù vào Sheet.',
              action: 'Khởi động lại',
            }}
          >
            <RefreshCw /> Khởi động lại dịch vụ
          </ActionButton>
        }
      />
      <main className='space-y-6 p-6'>
        {status.error && <ErrorBox message={status.error} />}
        {s && !s.service.running && (
          <ErrorBox
            title='Dịch vụ Zalo không chạy'
            message={`Không kết nối được 127.0.0.1:3847 (${s.service.error ?? ''}).\nBấm “Khởi động lại dịch vụ”, hoặc cài dịch vụ: install-service.ps1 trong thư mục dự án.`}
          />
        )}
        {s?.service.oldVersion && (
          <ErrorBox
            title='Dịch vụ đang chạy bản cũ'
            message={'Dịch vụ chưa có phần quản trị nên chưa đọc được trạng thái và danh sách nhóm.\nChạy lại install-service.ps1 từ ổ G (PowerShell quyền Administrator).'}
          />
        )}

        {!s && status.loading ? (
          <div className='grid gap-4 md:grid-cols-2'>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className='h-44 rounded-xl' />
            ))}
          </div>
        ) : (
          <div className='grid gap-4 md:grid-cols-2'>
            <Tile
              icon={MessageCircle}
              title='Zalo'
              level={a ? (a.zalo.connected ? 'ok' : 'error') : 'idle'}
              label={a ? (a.zalo.connected ? 'Đã kết nối' : 'Mất kết nối') : 'Chưa rõ'}
            >
              <Row k='Tài khoản' v={a?.account?.name ?? '—'} />
              <Row k='Kết nối từ' v={ago(a?.zalo.lastConnectedAt)} />
              <Row k='Số lần nối lại' v={a?.zalo.reconnectCount ?? '—'} />
              <Row k='Đang theo dõi' v={a ? `${a.threads.watched} cuộc trò chuyện` : '—'} />
            </Tile>

            <Tile
              icon={FileSpreadsheet}
              title='Google Sheet'
              level={sheetsLevel}
              label={!a?.sheets.enabled ? 'Chưa bật' : sheetsLevel === 'ok' ? 'Đang ghi' : 'Đang lỗi'}
            >
              <Row k='Ghi thành công' v={a ? `${a.sheets.okCount ?? 0} lần — ${ago(a.sheets.lastOkAt)}` : '—'} />
              <Row k='Lỗi' v={a ? `${a.sheets.failCount ?? 0} lần` : '—'} />
              {a?.sheets.lastError && <Row k='Lỗi gần nhất' v={<span className='text-destructive'>{a.sheets.lastError}</span>} />}
              <button className='pt-1 text-primary hover:underline' onClick={() => go('sheets')}>
                Mở cài đặt Google Sheet →
              </button>
            </Tile>

            <Tile
              icon={Bot}
              title='Claude Code'
              level={claude.data?.connected ? 'ok' : claude.data ? 'warn' : 'idle'}
              label={claude.data?.connected ? 'Đã nối' : claude.loading ? 'Đang kiểm tra' : 'Chưa nối'}
            >
              <Row k='Kiểu kết nối' v={claude.data?.type ?? '—'} />
              <Row k='Trạng thái' v={claude.data?.status ?? (claude.data?.installed === false ? 'Chưa cài Claude Code' : '—')} />
              <button className='pt-1 text-primary hover:underline' onClick={() => go('settings')}>
                Kết nối lại Claude →
              </button>
            </Tile>

            <Tile
              icon={Server}
              title='Dịch vụ chạy nền'
              level={!s?.service.running ? 'error' : !a ? 'idle' : a.access.readOnly ? 'ok' : 'warn'}
              label={!s?.service.running ? 'Đã dừng' : !a ? 'Đang chạy' : a.access.readOnly ? 'Chỉ đọc' : 'Được gửi tin'}
            >
              <Row k='Đã chạy' v={duration(s?.service.uptimeSec)} />
              <Row k='Chế độ' v={a ? (a.access.readOnly ? 'Chỉ đọc (an toàn)' : 'AI được gửi tin') : '—'} />
              <Row k='Nhóm được gửi' v={a ? (a.access.readOnly ? 'Không' : (a.access.sendThreads?.length ?? 0)) : '—'} />
              <button className='pt-1 text-primary hover:underline' onClick={() => go('safety')}>
                Cài đặt an toàn →
              </button>
            </Tile>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Cách hoạt động</CardTitle>
            <CardDescription>
              Dịch vụ chạy nền luôn bật (kể cả khi đóng cửa sổ này hay tắt Claude), nghe các nhóm được theo dõi và ghi từng tin vào
              Google Sheet. Khi kết nối lại, tin bị lỡ được ghi bù — Sheet tự bỏ tin trùng.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </>
  )
}

import { Bot, Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { useTheme } from '@/context/theme-provider'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { ActionButton, PageHeader, StatusPill } from '@/components/common'

export function SettingsPage() {
  const settings = useData(api.settings)
  const claude = useData(api.claudeStatus)
  const { theme, setTheme } = useTheme()

  return (
    <>
      <PageHeader title='Cài đặt' description='Kết nối Claude, khởi động cùng Windows, giao diện' />
      <main className='grid gap-6 p-6 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Bot className='size-5 text-primary' /> Kết nối Claude Code
              {claude.data && (
                <StatusPill level={claude.data.connected ? 'ok' : 'warn'}>{claude.data.connected ? 'Đã nối' : 'Chưa nối'}</StatusPill>
              )}
            </CardTitle>
            <CardDescription>
              Đăng ký dịch vụ Zalo với Claude Code (kiểu HTTP, mã truy cập riêng). Sau đó mở phiên Claude mới để dùng công cụ Zalo.
            </CardDescription>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            {claude.loading ? 'Đang kiểm tra…' : claude.data?.installed === false ? 'Không thấy lệnh “claude” trên máy.' : claude.data?.status ?? 'Chưa đăng ký.'}
          </CardContent>
          <CardFooter>
            <ActionButton
              onRun={async () => {
                const r = await api.connectClaude()
                r.ok ? toast.success('Đã nối Claude Code với dịch vụ Zalo') : toast.error('Chưa nối được', { description: r.output.slice(-300) })
                claude.reload()
              }}
              confirm={{
                title: 'Nối lại Claude Code?',
                description: 'Phần mềm sẽ chạy “claude mcp remove/add zalo” (phạm vi người dùng). Các phiên Claude đang mở cần mở lại.',
                action: 'Nối lại',
              }}
            >
              Kết nối / nối lại
            </ActionButton>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Khởi động cùng Windows</CardTitle>
            <CardDescription>Mở phần mềm (thu nhỏ ở khay đồng hồ) khi đăng nhập Windows. Dịch vụ Zalo tự chạy riêng, không phụ thuộc mục này.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className='flex items-center gap-3 text-sm'>
              <Switch
                checked={settings.data?.autostart ?? false}
                disabled={!settings.data}
                onCheckedChange={async (on) => {
                  const r = await api.setAutostart(on)
                  toast.success(r ? 'Sẽ tự mở cùng Windows' : 'Đã tắt tự mở cùng Windows')
                  settings.reload()
                }}
              />
              Tự mở cùng Windows
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Giao diện</CardTitle>
          </CardHeader>
          <CardContent className='flex gap-2'>
            {(
              [
                ['light', Sun, 'Sáng'],
                ['dark', Moon, 'Tối'],
                ['system', Monitor, 'Theo Windows'],
              ] as const
            ).map(([v, Icon, label]) => (
              <Button key={v} variant={theme === v ? 'default' : 'outline'} onClick={() => setTheme(v)}>
                <Icon /> {label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1 text-sm text-muted-foreground'>
            <div>Phiên bản: {settings.data?.version ?? '—'}</div>
            <div>Thư mục cấu hình: {settings.data?.configDir ?? '—'}</div>
            <div>Giao diện dựa trên shadcn-admin (MIT).</div>
          </CardContent>
        </Card>
      </main>
    </>
  )
}

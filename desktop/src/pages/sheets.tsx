import { useEffect, useState } from 'react'
import { CheckCircle2, Copy, KeyRound, Save, Send, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api, type SheetsCheck } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ActionButton, ErrorBox, PageHeader } from '@/components/common'

const STEPS = [
  'Mở Google Sheet → Tiện ích mở rộng → Apps Script, dán Code.gs bản mới nhất (integrations/google-sheets/Code.gs).',
  'Cài đặt dự án (bánh răng) → Thuộc tính tập lệnh → TOKEN = dán mã vừa sao chép.',
  'Triển khai → Quản lý các bản triển khai → Sửa → Phiên bản mới → Triển khai (giữ nguyên URL).',
  'Quay lại đây bấm “Kiểm tra mã” → phải thấy “Mã khớp”.',
]

export function SheetsPage() {
  const config = useData(api.config)
  const [url, setUrl] = useState('')
  const [check, setCheck] = useState<SheetsCheck | null>(null)

  useEffect(() => {
    if (config.data) setUrl(config.data.forward.url)
  }, [config.data])

  const f = config.data?.forward
  const urlDirty = f && url.trim() !== f.url

  const runCheck = async (writeRow: boolean) => {
    const r = await api.checkSheets(writeRow)
    setCheck(r)
    r.ok ? toast.success(r.message) : toast.error(r.message)
  }

  return (
    <>
      <PageHeader title='Google Sheet' description='Mỗi tin của nhóm được theo dõi được ghi thành 1 dòng trong Sheet' />
      <main className='grid gap-6 p-6 xl:grid-cols-2'>
        {config.error && <ErrorBox message={config.error} />}

        <Card>
          <CardHeader>
            <CardTitle>1. Địa chỉ Apps Script</CardTitle>
            <CardDescription>URL web app của Apps Script (kết thúc bằng /exec).</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Label htmlFor='url'>URL</Label>
            <Input id='url' value={url} onChange={(e) => setUrl(e.target.value)} placeholder='https://script.google.com/macros/s/…/exec' />
          </CardContent>
          <CardFooter>
            <ActionButton
              disabled={!urlDirty}
              onRun={async () => {
                try {
                  const r = await api.saveSheetsUrl(url.trim())
                  r.ok ? toast.success('Đã lưu URL và khởi động lại dịch vụ') : toast.warning('Đã lưu URL, khởi động lại dịch vụ chưa thành công')
                  config.reload()
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            >
              <Save /> Lưu URL
            </ActionButton>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              2. Mã bí mật
              {f?.tokenSet ? <Badge variant='secondary'>{f.tokenTail}</Badge> : <Badge variant='destructive'>Chưa có</Badge>}
            </CardTitle>
            <CardDescription>Mã phải giống hệt TOKEN trong Apps Script. Phần mềm không bao giờ hiện mã đầy đủ.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className='list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground'>
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </CardContent>
          <CardFooter className='flex flex-wrap gap-2'>
            <ActionButton
              variant='outline'
              disabled={!f?.tokenSet}
              onRun={async () => {
                const r = await api.copySheetsToken()
                toast.success(`Đã sao chép mã ${r.tail} — dán vào Thuộc tính tập lệnh TOKEN`)
              }}
            >
              <Copy /> Sao chép mã
            </ActionButton>
            <ActionButton
              variant={f?.tokenSet ? 'outline' : 'default'}
              onRun={async () => {
                const r = await api.newSheetsToken()
                toast.success(`Đã tạo mã mới ${r.tail} và sao chép`, { description: 'Dán ngay vào Apps Script, nếu không Sheet sẽ từ chối.' })
                config.reload()
                setCheck(null)
              }}
              confirm={
                f?.tokenSet
                  ? {
                      title: 'Tạo mã mới?',
                      description:
                        'Mã cũ sẽ bị thay. Cho đến khi anh dán mã mới vào Apps Script, Sheet sẽ TỪ CHỐI ghi (tin vẫn được ghi bù sau khi khớp).',
                      action: 'Tạo mã mới',
                    }
                  : undefined
              }
            >
              <KeyRound /> Tạo mã mới
            </ActionButton>
          </CardFooter>
        </Card>

        <Card className='xl:col-span-2'>
          <CardHeader>
            <CardTitle>3. Kiểm tra</CardTitle>
            <CardDescription>So “vân tay” mã trên máy với mã Apps Script đang dùng; tuỳ chọn ghi 1 dòng “KIEM TRA” vào Sheet.</CardDescription>
          </CardHeader>
          {check && (
            <CardContent>
              <div
                className={`flex items-start gap-3 rounded-lg border p-4 ${check.ok ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'}`}
              >
                {check.ok ? <CheckCircle2 className='mt-0.5 text-success' /> : <XCircle className='mt-0.5 text-destructive' />}
                <div className='space-y-1 text-sm'>
                  <div className='font-medium'>{check.message}</div>
                  {check.local && (
                    <div className='text-muted-foreground'>
                      Vân tay trên máy: <code>{check.local}</code> · Apps Script: <code>{check.remote ?? '—'}</code>
                      {check.spreadsheet && <> · Sheet: {check.spreadsheet}</>}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          )}
          <CardFooter className='flex flex-wrap gap-2'>
            <ActionButton variant='outline' onRun={() => runCheck(false)}>
              <ShieldCheck /> Kiểm tra mã
            </ActionButton>
            <ActionButton onRun={() => runCheck(true)}>
              <Send /> Kiểm tra và ghi dòng thử
            </ActionButton>
          </CardFooter>
        </Card>
      </main>
    </>
  )
}

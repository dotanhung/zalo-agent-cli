import { Lock, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ActionButton, ErrorBox, PageHeader, StatusPill } from '@/components/common'

const STATUS = {
  sent: { level: 'ok', label: 'Đã gửi' },
  blocked: { level: 'warn', label: 'Bị chặn' },
  error: { level: 'error', label: 'Lỗi' },
} as const

export function SafetyPage() {
  const config = useData(api.config)
  const log = useData(() => api.sendLog(200), 15000)
  const ro = config.data?.readOnly

  const setReadOnly = async (readOnly: boolean) => {
    const c = config.data!
    // Unlocking never grants a thread: each one is ticked and confirmed on the Groups page afterwards
    const r = await api.saveAccess({ watchThreads: c.watchThreads, sendThreads: readOnly ? c.sendThreads : [], readOnly })
    r.restart.ok
      ? toast.success(
          readOnly
            ? 'Đã BẬT chỉ đọc — AI không gửi được tin'
            : 'Đã TẮT chỉ đọc — chưa nhóm nào được gửi; tick từng nhóm ở trang Nhóm theo dõi'
        )
      : toast.warning('Đã lưu, nhưng khởi động lại dịch vụ chưa thành công')
    config.reload()
  }

  return (
    <>
      <PageHeader title='An toàn' description='Quyền gửi tin của AI và nhật ký mọi lần gửi' />
      <main className='space-y-6 p-6'>
        {config.error && <ErrorBox message={config.error} />}
        <Card>
          <CardHeader className='flex flex-row items-start gap-4'>
            <div className={`grid size-12 place-items-center rounded-xl ${ro ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              {ro ? <Lock /> : <LockOpen />}
            </div>
            <div className='flex-1 space-y-1'>
              <CardTitle className='flex items-center gap-2'>
                Chế độ chỉ đọc
                {config.data && <StatusPill level={ro ? 'ok' : 'warn'}>{ro ? 'Đang BẬT' : 'Đang TẮT'}</StatusPill>}
              </CardTitle>
              <CardDescription>
                Khi BẬT, Claude chỉ đọc tin — công cụ gửi tin bị ẩn hoàn toàn. Khi TẮT, Claude gửi được tin nhưng chỉ vào các nhóm có tick “Được gửi”.
              </CardDescription>
            </div>
            {config.data &&
              (ro ? (
                <ActionButton
                  variant='outline'
                  onRun={() => setReadOnly(false)}
                  confirm={{
                    title: 'Cho phép AI gửi tin Zalo?',
                    description:
                      'Sau khi tắt, AI CHƯA được gửi vào nhóm nào. Muốn cho gửi: vào trang Nhóm theo dõi, tick “Được gửi” cho từng nhóm và xác nhận riêng từng nhóm.\nMỗi lần gửi đều ghi nhật ký bên dưới. Dịch vụ sẽ khởi động lại.',
                    action: 'Tắt chỉ đọc',
                  }}
                >
                  <LockOpen /> Tắt chỉ đọc
                </ActionButton>
              ) : (
                <ActionButton onRun={() => setReadOnly(true)}>
                  <Lock /> Bật chỉ đọc
                </ActionButton>
              ))}
          </CardHeader>
        </Card>

        <Card className='pb-0'>
          <CardHeader>
            <CardTitle>Nhật ký gửi tin</CardTitle>
            <CardDescription>Mọi lần AI gửi hoặc bị chặn — mới nhất ở trên.</CardDescription>
          </CardHeader>
          <CardContent className='px-0'>
            {log.error && <ErrorBox message={log.error} />}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-44 pl-6'>Thời gian</TableHead>
                  <TableHead className='w-28'>Kết quả</TableHead>
                  <TableHead className='w-52'>Cuộc trò chuyện</TableHead>
                  <TableHead>Nội dung / lý do</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(log.data ?? []).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className='pl-6 text-muted-foreground'>{new Date(r.ts).toLocaleString('vi-VN')}</TableCell>
                    <TableCell>
                      <StatusPill level={STATUS[r.status]?.level ?? 'idle'}>{STATUS[r.status]?.label ?? r.status}</StatusPill>
                    </TableCell>
                    <TableCell className='text-xs'>
                      {r.threadType}:{r.threadId}
                    </TableCell>
                    <TableCell>
                      <div className='line-clamp-2'>{r.text}</div>
                      {r.error && <div className='text-xs text-destructive'>{r.error}</div>}
                    </TableCell>
                  </TableRow>
                ))}
                {log.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className='py-10 text-center text-muted-foreground'>
                      Chưa có lần gửi nào.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </>
  )
}

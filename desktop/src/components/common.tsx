import { useState } from 'react'
import { AlertCircle, CheckCircle2, CircleDashed, Loader2, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className='sticky top-0 z-10 flex items-center gap-3 border-b bg-background/90 px-6 py-4 backdrop-blur'>
      <SidebarTrigger className='-ml-2' />
      <Separator orientation='vertical' className='h-6' />
      <div className='min-w-0 flex-1'>
        <h1 className='truncate text-lg font-semibold'>{title}</h1>
        {description && <p className='truncate text-sm text-muted-foreground'>{description}</p>}
      </div>
      {actions && <div className='flex items-center gap-2'>{actions}</div>}
    </header>
  )
}

export type Level = 'ok' | 'warn' | 'error' | 'idle'

const LEVEL = {
  ok: { icon: CheckCircle2, cls: 'text-success bg-success/10 ring-success/30' },
  warn: { icon: TriangleAlert, cls: 'text-warning bg-warning/10 ring-warning/30' },
  error: { icon: AlertCircle, cls: 'text-destructive bg-destructive/10 ring-destructive/30' },
  idle: { icon: CircleDashed, cls: 'text-muted-foreground bg-muted ring-border' },
}

export function StatusPill({ level, children }: { level: Level; children: React.ReactNode }) {
  const { icon: Icon, cls } = LEVEL[level]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1', cls)}>
      <Icon className='size-3.5' />
      {children}
    </span>
  )
}

export function ErrorBox({ title = 'Có lỗi', message }: { title?: string; message: string }) {
  return (
    <Alert variant='destructive'>
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className='whitespace-pre-wrap'>{message}</AlertDescription>
    </Alert>
  )
}

/** Button that runs an async action, optionally behind a confirm dialog. */
export function ActionButton({
  onRun,
  confirm,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'onClick'> & {
  onRun: () => Promise<unknown>
  confirm?: { title: string; description: string; action?: string }
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const run = async () => {
    setOpen(false)
    setBusy(true)
    try {
      await onRun()
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button {...props} disabled={busy || props.disabled} onClick={() => (confirm ? setOpen(true) : run())}>
        {busy && <Loader2 className='animate-spin' />}
        {children}
      </Button>
      {confirm && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription className='whitespace-pre-wrap'>{confirm.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction onClick={run}>{confirm.action ?? 'Đồng ý'}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

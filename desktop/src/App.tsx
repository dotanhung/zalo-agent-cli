import { useState } from 'react'
import { FileSpreadsheet, LayoutDashboard, ScrollText, Settings, ShieldCheck, Users } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { OverviewPage } from '@/pages/overview'
import { GroupsPage } from '@/pages/groups'
import { SheetsPage } from '@/pages/sheets'
import { SafetyPage } from '@/pages/safety'
import { LogsPage } from '@/pages/logs'
import { SettingsPage } from '@/pages/settings'

export type Page = 'overview' | 'groups' | 'sheets' | 'safety' | 'logs' | 'settings'

const NAV: { group: string; items: { id: Page; label: string; icon: React.ElementType }[] }[] = [
  {
    group: 'Vận hành',
    items: [
      { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
      { id: 'groups', label: 'Nhóm theo dõi', icon: Users },
      { id: 'sheets', label: 'Google Sheet', icon: FileSpreadsheet },
    ],
  },
  {
    group: 'Hệ thống',
    items: [
      { id: 'safety', label: 'An toàn', icon: ShieldCheck },
      { id: 'logs', label: 'Nhật ký', icon: ScrollText },
      { id: 'settings', label: 'Cài đặt', icon: Settings },
    ],
  },
]

function Logo() {
  return (
    <div className='grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground'>Z</div>
  )
}

export function App() {
  const [page, setPage] = useState<Page>('overview')

  return (
    <SidebarProvider>
      <Sidebar collapsible='icon' variant='inset'>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size='lg' className='pointer-events-none'>
                <Logo />
                <div className='grid flex-1 text-left leading-tight'>
                  <span className='truncate font-semibold'>TQM Zalo Agent</span>
                  <span className='truncate text-xs text-muted-foreground'>Bảng điều khiển</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {NAV.map((g) => (
            <SidebarGroup key={g.group}>
              <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
              <SidebarMenu>
                {g.items.map((it) => (
                  <SidebarMenuItem key={it.id}>
                    <SidebarMenuButton isActive={page === it.id} tooltip={it.label} onClick={() => setPage(it.id)}>
                      <it.icon />
                      <span>{it.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className='px-3 pb-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden'>
          Đóng cửa sổ vẫn chạy ở khay đồng hồ.
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {page === 'overview' && <OverviewPage go={setPage} />}
        {page === 'groups' && <GroupsPage />}
        {page === 'sheets' && <SheetsPage />}
        {page === 'safety' && <SafetyPage />}
        {page === 'logs' && <LogsPage />}
        {page === 'settings' && <SettingsPage />}
      </SidebarInset>
      <Toaster richColors position='top-right' duration={5000} />
    </SidebarProvider>
  )
}

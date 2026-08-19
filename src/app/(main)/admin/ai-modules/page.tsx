import { redirect } from 'next/navigation';

/** 旧 AI 模块方案页已并入统一 AI 管理页 /admin/ai */
export default function AdminAiModulesLegacyPage() {
  redirect('/admin/ai');
}

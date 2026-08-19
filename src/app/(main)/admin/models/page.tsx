import { redirect } from 'next/navigation';

/** 旧模型管理页已并入统一 AI 管理页 /admin/ai */
export default function AdminModelsLegacyPage() {
  redirect('/admin/ai');
}

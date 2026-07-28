import { redirect } from 'next/navigation';

/** 旧仪表盘已合并到系统总控，保留路径兼容。 */
export default function AdminIndexPage(): never {
  redirect('/admin/control');
}

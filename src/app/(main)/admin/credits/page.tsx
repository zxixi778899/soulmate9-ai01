'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 积分管理已并入「用户管理」页面（用户列表 tab，可编辑每个用户的积分）。
 * 此路由保留为重定向，兼容旧链接。
 */
export default function AdminCreditsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/users');
  }, [router]);
  return null;
}

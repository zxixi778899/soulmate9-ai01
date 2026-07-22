'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 代币与积分已并入「用户管理」页面（代币套餐 tab）。
 * 此路由保留为重定向，兼容旧链接。
 */
export default function AdminTokensPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/users?tab=tokens');
  }, [router]);
  return null;
}

import { redirect } from 'next/navigation';

/**
 * Achievements have been merged into the Adventure Log (/quest).
 * Keep the old URL alive as a redirect.
 */
export default function AchievementsPage() {
  redirect('/quest?tab=achievements');
}

import { redirect } from 'next/navigation';

/**
 * Profile and account are one product surface. Keep the legacy/account-friendly
 * URL without maintaining a second layout, state model, or settings form.
 */
export default function AccountPage(): never {
  redirect('/profile');
}

import { redirect } from 'next/navigation';

type LegacyCompanionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LegacyCompanionPage({ params }: LegacyCompanionPageProps) {
  const { id } = await params;
  redirect(`/chats?friend=${encodeURIComponent(id)}`);
}

import { ClientDetailModule } from "@/features/clients";

interface ClientDetailPageProps {
  params: Promise<{ clientId: string }>;
}

export default async function Page({ params }: ClientDetailPageProps) {
  const { clientId } = await params;
  return <ClientDetailModule clientId={clientId} />;
}

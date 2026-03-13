import { MaterialDetailModule } from "@/features/materials";

interface MaterialDetailPageProps {
  params: Promise<{ materialId: string }>;
}

export default async function Page({ params }: MaterialDetailPageProps) {
  const { materialId } = await params;
  return <MaterialDetailModule materialId={materialId} />;
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ModulePlaceholderProps {
  title: string;
  description: string;
}

export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Base inicial preparada</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Este módulo está listo para crecer con separación clara entre presentación, dominio,
            servicios y validaciones.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


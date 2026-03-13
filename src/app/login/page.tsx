import { Factory, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components";
import { getAuthenticatedAppUser } from "@/features/auth/services/session.service";

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const currentUser = await getAuthenticatedAppUser();
  if (currentUser) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const nextPath = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <div className="grid min-h-screen bg-slate-100 lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden border-r border-slate-200 bg-white p-10 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Factory className="h-6 w-6" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold text-slate-900">Carpi ERP</h1>
          <p className="mt-3 max-w-md text-sm text-slate-600">
            Gestion integral para carpinteria industrial, muebles a medida, costos y produccion.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-700" />
            <p className="text-xs text-slate-600">
              El acceso usa Supabase Auth con sesiones seguras. Todo el modulo operativo queda protegido.
            </p>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="border-b-0 pb-2">
            <CardTitle>Iniciar sesion</CardTitle>
            <CardDescription>Usa tus credenciales para ingresar al panel de gestion.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm nextPathHint={nextPath} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}


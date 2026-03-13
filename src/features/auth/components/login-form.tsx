"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasSupabaseConfig } from "@/services/supabase";
import { LoginSchema, type LoginInput } from "../schemas";
import { isSafeInternalPath } from "../services/role.service";
import { signInWithPassword } from "../services";

interface LoginFormProps {
  nextPathHint?: string;
}

export function LoginForm({ nextPathHint }: LoginFormProps) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [authError, setAuthError] = useState<string | null>(null);

  const nextPath = isSafeInternalPath(nextPathHint) ? nextPathHint : "/dashboard";

  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "tomasgattone7@gmail.com",
      password: "trmmg07DF$@",
    },
  });

  const isConfigured = hasSupabaseConfig();

  const onSubmit = form.handleSubmit(async (values) => {
    setAuthError(null);

    const { error } = await signInWithPassword(values);

    if (error) {
      setAuthError(error);
      return;
    }

    startTransition(() => {
      router.replace(nextPath);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            id="email"
            type="email"
            placeholder="nombre@empresa.com"
            className="pl-9"
            autoComplete="email"
            {...form.register("email")}
          />
        </div>
        {form.formState.errors.email ? (
          <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contrasena</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            id="password"
            type="password"
            placeholder="********"
            className="pl-9"
            autoComplete="current-password"
            {...form.register("password")}
          />
        </div>
        {form.formState.errors.password ? (
          <p className="text-xs text-red-600">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      {authError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{authError}</p> : null}

      {!isConfigured ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY para habilitar autenticacion.
        </p>
      ) : null}

      <Button
        type="submit"
        className="w-full"
        disabled={!isConfigured || form.formState.isSubmitting || isNavigating}
      >
        {form.formState.isSubmitting || isNavigating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Ingresando...
          </>
        ) : (
          "Ingresar"
        )}
      </Button>
    </form>
  );
}

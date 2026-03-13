"use client";

import { Download, Upload } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef } from "react";
import { ModuleHeader } from "@/components/shared/module-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/store";
import { downloadText } from "@/lib/utils";

export function ConfigModule() {
  const { theme, setTheme } = useTheme();
  const { state, setState, actions } = useAppStore();
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Configuración"
        description="Preferencias de interfaz, respaldo de datos y restauración de entorno."
      />

      <Card>
        <CardHeader>
          <CardTitle>Interfaz</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Modo oscuro</p>
            <p className="text-xs text-slate-500">Alternar tema de trabajo.</p>
          </div>
          <Switch checked={theme === "dark"} onChange={(e) => setTheme(e.target.checked ? "dark" : "light")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadText("carpi-backup.json", JSON.stringify(state, null, 2), "application/json")}>
            <Download className="mr-2 h-4 w-4" /> Exportar backup
          </Button>

          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Importar backup
          </Button>

          <Button variant="destructive" onClick={actions.resetSeed}>Restaurar seed demo</Button>

          <input
            ref={fileRef}
            hidden
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const parsed = JSON.parse(String(reader.result));
                  setState(parsed);
                } catch {
                  // ignore invalid file
                }
              };
              reader.readAsText(file);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}


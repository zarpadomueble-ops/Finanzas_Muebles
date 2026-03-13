import { clientsService } from "@/services/clients";
import type { ClientFormInput, ClientsQueryInput } from "../schemas";

function mapClientPayload(input: ClientFormInput) {
  return {
    nombre: input.nombre.trim(),
    telefono: input.telefono.trim() || null,
    email: input.email.trim() || null,
    direccion: input.direccion.trim() || null,
    ciudad: input.ciudad.trim() || null,
    provincia: input.provincia.trim() || null,
    notas: input.notas.trim() || null,
    canal_ingreso: input.canal_ingreso.trim() || null,
    fecha_alta: input.fecha_alta || null,
  };
}

export async function listClientsRecords(filters: Partial<ClientsQueryInput> = {}) {
  return clientsService.list({
    search: filters.search,
    ciudad: filters.ciudad,
    canal_ingreso: filters.canal_ingreso,
    include_deleted: filters.include_deleted ?? false,
  });
}

export async function getClientDetailRecord(clientId: string) {
  return clientsService.getDetail(clientId);
}

export async function createClientRecord(input: ClientFormInput) {
  return clientsService.create(mapClientPayload(input));
}

export async function updateClientRecord(clientId: string, input: ClientFormInput) {
  return clientsService.update(clientId, mapClientPayload(input));
}

export async function archiveClientRecord(clientId: string) {
  await clientsService.softDelete(clientId);
}

export async function restoreClientRecord(clientId: string) {
  await clientsService.restore(clientId);
}

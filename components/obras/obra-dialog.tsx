"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createObra, updateObra } from "@/app/(app)/obras/actions";
import { QuickCreateContactDialog } from "./quick-create-contact-dialog";
import { OBRA_STATUS_OPTIONS } from "./obra-shared";
import type { Contact, ObraStatus, ObraSummary } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Obra em edição — null cria uma nova. */
  obra: ObraSummary | null;
  contacts: Contact[];
}

export function ObraDialog({ open, onClose, obra, contacts }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactId, setContactId] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<ObraStatus>("planejamento");
  const [startDate, setStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");

  const [localContacts, setLocalContacts] = useState<Contact[]>(contacts);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  useEffect(() => setLocalContacts(contacts), [contacts]);

  useEffect(() => {
    if (!open) return;
    setName(obra?.name ?? "");
    setContactId(obra?.contact_id ?? "");
    setLocation(obra?.location ?? "");
    setStatus(obra?.status ?? "planejamento");
    setStartDate(obra?.start_date ?? "");
    setPlannedEndDate(obra?.planned_end_date ?? "");
    setBudget(obra?.budget != null ? String(obra.budget) : "");
    setNotes(obra?.notes ?? "");
    setError(null);
  }, [open, obra]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome da obra");
      return;
    }

    startTransition(async () => {
      const input = {
        name,
        contact_id: contactId || null,
        location,
        status,
        start_date: startDate || null,
        planned_end_date: plannedEndDate || null,
        budget: budget ? parseFloat(budget.replace(/\./g, "").replace(",", ".")) : null,
        notes,
      };
      const r = obra ? await updateObra(obra.id, input) : await createObra(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      onClose();
    });
  }

  function handleContactCreated(contact: Contact) {
    setLocalContacts((prev) =>
      [...prev.filter((c) => c.id !== contact.id), contact].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    setContactId(contact.id);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {obra ? "Editar obra" : "Nova obra"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="obra_name">Nome *</Label>
            <Input
              id="obra_name"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="ex: reforma galpão, obra sítio boa vista"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <SearchableSelect
              items={localContacts}
              value={contactId}
              onChange={setContactId}
              getId={(c) => c.id}
              getLabel={(c) => c.name}
              placeholder="Selecione um cliente (opcional)..."
              searchPlaceholder="Buscar cliente..."
              emptyMessage="Nenhum cliente cadastrado"
              onCreateNew={() => setContactDialogOpen(true)}
              createNewLabel="Cadastrar cliente"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obra_location">Local</Label>
            <Input
              id="obra_location"
              value={location}
              onChange={(e) => setLocation(e.target.value.toUpperCase())}
              placeholder="endereço / referência (opcional)"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {OBRA_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`py-2 text-xs rounded-lg border font-medium transition-colors ${
                    status === opt.value
                      ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-950/40 dark:border-produmar-700 dark:text-produmar-300"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="obra_start">Início</Label>
              <Input
                id="obra_start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obra_end">Previsão de término</Label>
              <Input
                id="obra_end"
                type="date"
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obra_budget">Orçamento</Label>
            <Input
              id="obra_budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="opcional, ex: 15000,00"
              inputMode="decimal"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obra_notes">Observações</Label>
            <Textarea
              id="obra_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="detalhes da obra..."
              className="uppercase placeholder:normal-case placeholder:lowercase"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : obra ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <QuickCreateContactDialog
      open={contactDialogOpen}
      onClose={() => setContactDialogOpen(false)}
      onCreated={handleContactCreated}
    />
    </>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import {
  Wallet,
  Plus,
  LogOut,
  Pencil,
  Trash2,
  TrendingDown,
  UtensilsCrossed,
  Car,
  Home,
  Gamepad2,
  HeartPulse,
  GraduationCap,
  ShoppingBag,
  Lightbulb,
  MoreHorizontal,
  Loader2,
  Calendar,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Mis gastos — Gastos" }] }),
});

type Category =
  | "comida"
  | "transporte"
  | "hogar"
  | "entretenimiento"
  | "salud"
  | "educacion"
  | "compras"
  | "servicios"
  | "otros";

interface Expense {
  id: string;
  amount: number;
  category: Category;
  description: string;
  spent_at: string;
  created_at: string;
}

const CATEGORIES: {
  value: Category;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  {
    value: "comida",
    label: "Comida",
    icon: UtensilsCrossed,
    color: "bg-orange-100 text-orange-700",
  },
  { value: "transporte", label: "Transporte", icon: Car, color: "bg-blue-100 text-blue-700" },
  { value: "hogar", label: "Hogar", icon: Home, color: "bg-emerald-100 text-emerald-700" },
  {
    value: "entretenimiento",
    label: "Entretenimiento",
    icon: Gamepad2,
    color: "bg-purple-100 text-purple-700",
  },
  { value: "salud", label: "Salud", icon: HeartPulse, color: "bg-rose-100 text-rose-700" },
  {
    value: "educacion",
    label: "Educación",
    icon: GraduationCap,
    color: "bg-indigo-100 text-indigo-700",
  },
  { value: "compras", label: "Compras", icon: ShoppingBag, color: "bg-pink-100 text-pink-700" },
  {
    value: "servicios",
    label: "Servicios",
    icon: Lightbulb,
    color: "bg-yellow-100 text-yellow-700",
  },
  { value: "otros", label: "Otros", icon: MoreHorizontal, color: "bg-slate-100 text-slate-700" },
];

const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const expenseSchema = z.object({
  amount: z.number().positive("Debe ser mayor a 0").max(99999999),
  category: z.enum([
    "comida",
    "transporte",
    "hogar",
    "entretenimiento",
    "salud",
    "educacion",
    "compras",
    "servicios",
    "otros",
  ]),
  description: z.string().trim().max(200),
  spent_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(n);
}
function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string>("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()));
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setShowInstall(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, amount, category, description, spent_at, created_at")
        .order("spent_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Expense[]).map((e) => ({ ...e, amount: Number(e.amount) }));
    },
  });

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(monthKey(new Date()));
    for (const e of expenses) set.add(monthKey(new Date(e.spent_at + "T00:00:00")));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  const monthExpenses = useMemo(
    () => expenses.filter((e) => monthKey(new Date(e.spent_at + "T00:00:00")) === selectedMonth),
    [expenses, selectedMonth],
  );

  const monthTotal = useMemo(
    () => monthExpenses.reduce((s, e) => s + e.amount, 0),
    [monthExpenses],
  );
  const totalAll = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const isCurrentMonth = selectedMonth === monthKey(new Date());

  const upsert = useMutation({
    mutationFn: async (input: {
      id?: string;
      amount: number;
      category: Category;
      description: string;
      spent_at: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("No autenticado");
      if (input.id) {
        const { error } = await supabase
          .from("expenses")
          .update({
            amount: input.amount,
            category: input.category,
            description: input.description,
            spent_at: input.spent_at,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert({
          user_id: u.user.id,
          amount: input.amount,
          category: input.category,
          description: input.description,
          spent_at: input.spent_at,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setOpenForm(false);
      setEditing(null);
      toast.success(vars.id ? "Gasto actualizado" : "Gasto registrado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setDeleteId(null);
      toast.success("Gasto eliminado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  async function handleLogout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const grouped = useMemo(() => {
    const g = new Map<string, Expense[]>();
    for (const e of monthExpenses) {
      const k = e.spent_at;
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(e);
    }
    return Array.from(g.entries());
  }, [monthExpenses]);

  return (
    <main className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="bg-gradient-hero px-5 pb-12 pt-10 text-white safe-top">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-white/60">Hola,</p>
              <p className="text-sm font-medium">{email || "usuario"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showInstall && !installed && deferredPrompt ? (
              <Button
                onClick={async () => {
                  await deferredPrompt.prompt();
                  const choice = await deferredPrompt.userChoice;
                  if (choice.outcome === "accepted") {
                    toast.success("Instalación aceptada. Busca la app en la pantalla de inicio.");
                  } else {
                    toast("Instalación cancelada.");
                  }
                  setDeferredPrompt(null);
                  setShowInstall(false);
                }}
                size="sm"
                className="h-9 rounded-full bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20"
              >
                Instalar app
              </Button>
            ) : null}
            <Button
              onClick={handleLogout}
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/10"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Summary card with month selector */}
      <section className="mx-auto -mt-8 max-w-md px-5">
        <div className="rounded-3xl bg-card p-6 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {isCurrentMonth ? "Gastado este mes" : "Gastado en"}
            </p>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-9 w-auto gap-2 rounded-full border-border bg-muted/40 px-3 text-xs font-medium capitalize">
                <Calendar className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="mt-2 text-4xl font-bold tracking-tight text-foreground">
            {formatMoney(monthTotal)}
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4 text-primary" />
            <span>
              Total histórico: <b className="text-foreground">{formatMoney(totalAll)}</b>
            </span>
          </div>
        </div>
      </section>

      {/* List */}
      <section className="mx-auto mt-6 max-w-md px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize">{monthLabel(selectedMonth)}</h2>
          <span className="text-xs text-muted-foreground">{monthExpenses.length} movimientos</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : monthExpenses.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
            <Wallet className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">
              {isCurrentMonth ? "Aún no tienes gastos este mes" : "Sin gastos en este mes"}
            </p>
            {isCurrentMonth && (
              <p className="mt-1 text-xs text-muted-foreground">
                Toca el botón + para registrar el primero.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(date)}
                </div>
                <div className="space-y-2">
                  {items.map((e) => {
                    const c = catMap[e.category];
                    const Icon = c.icon;
                    return (
                      <button
                        key={e.id}
                        onClick={() => {
                          setEditing(e);
                          setOpenForm(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card transition active:scale-[0.98]"
                      >
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.color}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {e.description || c.label}
                          </p>
                          <p className="text-xs text-muted-foreground">{c.label}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">-{formatMoney(e.amount)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FAB */}
      <Dialog
        open={openForm}
        onOpenChange={(v) => {
          setOpenForm(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogTrigger asChild>
          <button
            aria-label="Agregar gasto"
            className="fixed bottom-6 left-1/2 z-40 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground shadow-soft transition active:scale-95 safe-bottom"
            style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            onClick={() => setEditing(null)}
          >
            <Plus className="h-7 w-7" />
          </button>
        </DialogTrigger>
        <ExpenseFormDialog
          editing={editing}
          loading={upsert.isPending}
          onSubmit={(v) => upsert.mutate({ ...v, id: editing?.id })}
          onDelete={editing ? () => setDeleteId(editing.id) : undefined}
        />
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar gasto?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function ExpenseFormDialog({
  editing,
  loading,
  onSubmit,
  onDelete,
}: {
  editing: Expense | null;
  loading: boolean;
  onSubmit: (v: {
    amount: number;
    category: Category;
    description: string;
    spent_at: string;
  }) => void;
  onDelete?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<Category>("comida");
  const [description, setDescription] = useState("");
  const [spentAt, setSpentAt] = useState(today);

  useEffect(() => {
    if (editing) {
      setAmount(String(editing.amount));
      setCategory(editing.category);
      setDescription(editing.description);
      setSpentAt(editing.spent_at);
    } else {
      setAmount("");
      setCategory("comida");
      setDescription("");
      setSpentAt(today);
    }
  }, [editing, today]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = expenseSchema.safeParse({
      amount: Number(amount),
      category,
      description,
      spent_at: spentAt,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    onSubmit(parsed.data);
  }

  return (
    <DialogContent className="max-w-md rounded-3xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Monto</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
              $
            </span>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-14 pl-8 text-2xl font-semibold"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Categoría</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <div className="flex items-center gap-2">
                    <c.icon className="h-4 w-4" />
                    {c.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Fecha</Label>
          <Input
            id="date"
            type="date"
            required
            value={spentAt}
            onChange={(e) => setSpentAt(e.target.value)}
            className="h-12"
            max={today}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="desc">Descripción (opcional)</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Café con un amigo…"
            maxLength={200}
            rows={2}
          />
        </div>

        <DialogFooter className="gap-2 sm:flex-row-reverse">
          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full bg-gradient-brand font-semibold"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : editing ? (
              <>
                <Pencil className="mr-2 h-4 w-4" /> Guardar
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" /> Registrar
              </>
            )}
          </Button>
          {editing && onDelete && (
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              className="h-12 w-full border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
            </Button>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

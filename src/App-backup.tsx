
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BriefcaseBusiness,
  ChartNoAxesCombined, ChevronDown, CircleHelp, Coins, LayoutDashboard,
  LogOut, Plus, Settings2, ShieldCheck, Wallet, Pencil, Trash2, X,
  RefreshCw,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Account, AccountType } from "./types/database";

type SessionUser = {
  id: string;
  email?: string;
  user_metadata?: { avatar_url?: string; full_name?: string };
};

type Page = "overview" | "accounts";

const accountTypes: { value: AccountType; label: string }[] = [
  { value: "pea", label: "PEA" },
  { value: "cto", label: "Compte-titres (CTO)" },
  { value: "crypto", label: "Cryptomonnaies" },
  { value: "savings", label: "Épargne / Livret" },
  { value: "current", label: "Compte courant" },
  { value: "other", label: "Autre" },
];

const sampleHistory = [
  { month: "Mai", value: 18200 },
  { month: "Juin", value: 18750 },
  { month: "Juil", value: 18420 },
  { month: "Août", value: 19300 },
  { month: "Sept", value: 19880 },
  { month: "Oct", value: 20540 },
  { month: "Nov", value: 21280 },
];

const navItems = [
  { label: "Vue d’ensemble", icon: LayoutDashboard, page: "overview" as const },
  { label: "Mes comptes", icon: Wallet, page: "accounts" as const },
  { label: "Investissements", icon: ChartNoAxesCombined },
  { label: "Cryptomonnaies", icon: Coins },
  { label: "Opérations", icon: Activity },
];

const emptyForm = {
  name: "",
  account_type: "pea" as AccountType,
  broker: "",
  currency: "EUR",
  notes: "",
};

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getAccountTypeLabel(type: AccountType) {
  return accountTypes.find((item) => item.value === type)?.label ?? "Autre";
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [activePage, setActivePage] = useState<Page>("overview");

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadAccounts();
    } else {
      setAccounts([]);
    }
  }, [user?.id]);

  const greeting = useMemo(() => {
    const name = user?.user_metadata?.full_name?.split(" ")[0];
    return name ? `Bonjour ${name}` : "Bonjour";
  }, [user]);

  async function loadAccounts() {
    if (!supabase || !user?.id) return;

    setAccountsLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError("Impossible de charger les comptes : " + error.message);
    } else {
      setAccounts((data ?? []) as Account[]);
    }

    setAccountsLoading(false);
  }

  async function signIn() {
    if (!supabase) return;

    setSaving(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });

    if (error) setError(error.message);
    setSaving(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  function openCreateModal() {
    setEditingAccount(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEditModal(account: Account) {
    setEditingAccount(account);
    setForm({
      name: account.name,
      account_type: account.account_type,
      broker: account.broker ?? "",
      currency: account.currency ?? "EUR",
      notes: account.notes ?? "",
    });
    setError("");
    setModalOpen(true);
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user?.id) return;

    if (!form.name.trim()) {
      setError("Le nom du compte est obligatoire.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: form.name.trim(),
      account_type: form.account_type,
      broker: form.broker.trim() || null,
      currency: form.currency,
      notes: form.notes.trim() || null,
    };

    const result = editingAccount
      ? await supabase
          .from("accounts")
          .update(payload)
          .eq("id", editingAccount.id)
          .select()
          .single()
      : await supabase
          .from("accounts")
          .insert({ ...payload, user_id: user.id })
          .select()
          .single();

    if (result.error) {
      setError("Erreur lors de l'enregistrement : " + result.error.message);
      setSaving(false);
      return;
    }

    setModalOpen(false);
    setForm(emptyForm);
    setEditingAccount(null);
    setNotice(editingAccount ? "Compte modifié avec succès." : "Compte ajouté avec succès.");

    await loadAccounts();
    setSaving(false);
  }

  async function deleteAccount(account: Account) {
    if (!supabase) return;

    const confirmed = window.confirm(
      `Veux-tu vraiment supprimer le compte « ${account.name} » ?`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", account.id);

    if (error) {
      setError(
        "Impossible de supprimer ce compte. Il contient peut-être déjà des positions ou des opérations. Détail : " +
          error.message
      );
      return;
    }

    setNotice("Compte supprimé.");
    await loadAccounts();
  }

  const pageTitle = activePage === "overview" ? "Vue d’ensemble" : "Mes comptes";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Activity size={21} /></div>
          <span>FINOVA</span>
        </div>

        <div className="workspace-label">ESPACE PERSONNEL</div>

        <nav>
          {navItems.map(({ label, icon: Icon, page }) => (
            <button
              className={`nav-item ${page && activePage === page ? "active" : ""}`}
              key={label}
              onClick={() => {
                if (page) {
                  setActivePage(page);
                  setNotice("");
                  setError("");
                } else {
                  setNotice(`${label} sera disponible dans une prochaine étape.`);
                }
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => setNotice("Les préférences seront disponibles dans une prochaine étape.")}
          >
            <Settings2 size={18} />
            <span>Préférences</span>
          </button>

          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>Espace privé et sécurisé</span>
          </div>

          {user && (
            <button className="nav-item" onClick={signOut}>
              <LogOut size={18} />
              <span>Déconnexion</span>
            </button>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Finova <span>/</span> {pageTitle}
          </div>

          <div className="top-actions">
            <button className="icon-button" aria-label="Aide">
              <CircleHelp size={18} />
            </button>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <div className="avatar">
              {user?.email?.slice(0, 1).toUpperCase() ?? "F"}
            </div>
            <button className="profile-button">
              {user?.email ?? "Espace personnel"} <ChevronDown size={15} />
            </button>
          </div>
        </header>

        <div className="page">
          {activePage === "overview" && (
            <>
              <section className="welcome-row">
                <div>
                  <p className="eyebrow">ESPACE PERSONNEL</p>
                  <h1>{greeting} <span className="wave">✦</span></h1>
                  <p className="muted">Voici un aperçu de ton patrimoine.</p>
                </div>
                <button className="primary-button" onClick={openCreateModal} disabled={!user}>
                  <Plus size={17} /> Ajouter un compte
                </button>
              </section>

              {!isSupabaseConfigured && (
                <div className="setup-alert">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>Connexion à la base de données à configurer</strong>
                    <p>Vérifie les paramètres Supabase dans ton fichier .env.</p>
                  </div>
                </div>
              )}

              {authLoading && <div className="notice">Vérification de la connexion…</div>}

              {!user && !authLoading && isSupabaseConfigured && (
                <div className="setup-alert login-alert">
                  <div>
                    <strong>Connecte ton espace Finova</strong>
                    <p>Connecte-toi avec ton compte Google pour accéder à tes données.</p>
                  </div>
                  <button className="secondary-button" onClick={signIn} disabled={saving}>
                    Continuer avec Google
                  </button>
                </div>
              )}

              {notice && (
                <div className="notice" role="status">
                  {notice}
                  <button onClick={() => setNotice("")}>Fermer</button>
                </div>
              )}

              {error && (
                <div className="setup-alert error-alert" role="alert">
                  <div>{error}</div>
                  <button onClick={() => setError("")}>Fermer</button>
                </div>
              )}

              <section className="metrics-grid">
                <article className="metric-card main-metric">
                  <div className="metric-top">
                    <span>Patrimoine net</span>
                    <span className="metric-icon"><Wallet size={17} /></span>
                  </div>
                  <div className="metric-value">— €</div>
                  <div className="metric-foot">
                    <span className="neutral-pill">À renseigner</span>
                    <span className="muted">Valorisations à compléter</span>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>Actifs bruts</span>
                    <span className="metric-icon"><BriefcaseBusiness size={17} /></span>
                  </div>
                  <div className="metric-value">— €</div>
                  <div className="metric-foot muted">Comptes et investissements</div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>Dettes</span>
                    <span className="metric-icon"><ArrowDownRight size={17} /></span>
                  </div>
                  <div className="metric-value">— €</div>
                  <div className="metric-foot muted">Crédits et engagements</div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>Performance globale</span>
                    <span className="metric-icon"><ArrowUpRight size={17} /></span>
                  </div>
                  <div className="metric-value">—</div>
                  <div className="metric-foot muted">En attente des positions</div>
                </article>
              </section>

              <section className="content-grid">
                <article className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Évolution du patrimoine</h2>
                      <p className="muted">Historique de valorisation</p>
                    </div>
                    <button className="period-button">
                      Depuis le début <ChevronDown size={14} />
                    </button>
                  </div>

                  <div className="chart-placeholder">
                    <div className="empty-chart">
                      <ChartNoAxesCombined size={27} />
                      <strong>Ton historique apparaîtra ici</strong>
                      <span>Ajoute tes premières valorisations pour commencer.</span>
                    </div>
                    <div className="chart-hidden" aria-hidden="true">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sampleHistory}>
                          <defs>
                            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#36c9e8" stopOpacity={0.2} />
                              <stop offset="100%" stopColor="#36c9e8" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#202a40" strokeDasharray="3 3" />
                          <XAxis dataKey="month" stroke="#69758e" />
                          <YAxis stroke="#69758e" />
                          <Tooltip formatter={(v) => euro(Number(v))} />
                          <Area type="monotone" dataKey="value" stroke="#36c9e8" fill="url(#fill)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </article>

                <article className="panel allocation-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Répartition du patrimoine</h2>
                      <p className="muted">Par grande catégorie</p>
                    </div>
                  </div>
                  <div className="allocation-empty">
                    <div className="donut">
                      <span>—<small>EUR</small></span>
                    </div>
                    <p>Les répartitions s’afficheront après les premières valorisations.</p>
                  </div>
                </article>
              </section>
            </>
          )}

          {(activePage === "overview" || activePage === "accounts") && (
            <section className="panel bottom-panel">
              <div className="panel-heading">
                <div>
                  <h2>{activePage === "overview" ? "Mes comptes" : "Mes comptes et enveloppes"}</h2>
                  <p className="muted">
                    {activePage === "overview"
                      ? "Tous tes comptes et enveloppes au même endroit"
                      : "Retrouve et gère tous tes comptes enregistrés"}
                  </p>
                </div>
                <button className="text-button" onClick={openCreateModal} disabled={!user}>
                  <Plus size={15} /> Ajouter un compte
                </button>
              </div>

              {!user ? (
                <div className="account-empty">
                  <Wallet size={22} />
                  <div>
                    <strong>Connecte-toi pour afficher tes comptes</strong>
                    <span>Tes données personnelles apparaîtront ici.</span>
                  </div>
                </div>
              ) : accountsLoading ? (
                <div className="account-empty">
                  <RefreshCw size={22} />
                  <div>
                    <strong>Chargement des comptes…</strong>
                    <span>Récupération de tes données depuis Supabase.</span>
                  </div>
                </div>
              ) : accounts.length === 0 ? (
                <div className="account-empty">
                  <Wallet size={22} />
                  <div>
                    <strong>Aucun compte ajouté</strong>
                    <span>Commence par ajouter ton PEA, tes CTO ou tes livrets.</span>
                  </div>
                  <button className="secondary-button" onClick={openCreateModal}>
                    <Plus size={15} /> Ajouter un compte
                  </button>
                </div>
              ) : (
                <div className="account-list">
                  {accounts.map((account) => (
                    <div className="account-row" key={account.id}>
                      <div className="account-symbol">
                        <Wallet size={19} />
                      </div>
                      <div className="account-details">
                        <strong>{account.name}</strong>
                        <span>
                          {getAccountTypeLabel(account.account_type)}
                          {account.broker ? ` · ${account.broker}` : ""}
                        </span>
                      </div>
                      <div className="account-currency">{account.currency}</div>
                      <div className="account-actions">
                        <button
                          className="icon-button"
                          aria-label="Modifier le compte"
                          title="Modifier"
                          onClick={() => openEditModal(account)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Supprimer le compte"
                          title="Supprimer"
                          onClick={() => deleteAccount(account)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activePage === "accounts" && (
            <>
              {notice && (
                <div className="notice" role="status">
                  {notice}
                  <button onClick={() => setNotice("")}>Fermer</button>
                </div>
              )}
              {error && (
                <div className="setup-alert error-alert" role="alert">
                  <div>{error}</div>
                  <button onClick={() => setError("")}>Fermer</button>
                </div>
              )}
            </>
          )}

          <footer>FINOVA <span>•</span> Ton patrimoine, en toute clarté.</footer>
        </div>
      </main>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">MES COMPTES</p>
                <h2 id="account-modal-title">
                  {editingAccount ? "Modifier le compte" : "Ajouter un compte"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Fermer"
                onClick={() => setModalOpen(false)}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveAccount}>
              <label className="form-field">
                <span>Nom du compte *</span>
                <input
                  autoFocus
                  required
                  maxLength={100}
                  placeholder="Ex. PEA Fortuneo"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>

              <label className="form-field">
                <span>Type de compte *</span>
                <select
                  value={form.account_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      account_type: event.target.value as AccountType,
                    })
                  }
                >
                  {accountTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Banque ou courtier</span>
                <input
                  maxLength={100}
                  placeholder="Ex. Fortuneo, Trade Republic..."
                  value={form.broker}
                  onChange={(event) =>
                    setForm({ ...form, broker: event.target.value })
                  }
                />
              </label>

              <label className="form-field">
                <span>Devise</span>
                <select
                  value={form.currency}
                  onChange={(event) =>
                    setForm({ ...form, currency: event.target.value })
                  }
                >
                  <option value="EUR">Euro (EUR)</option>
                  <option value="USD">Dollar américain (USD)</option>
                  <option value="GBP">Livre sterling (GBP)</option>
                  <option value="CHF">Franc suisse (CHF)</option>
                </select>
              </label>

              <label className="form-field">
                <span>Notes (facultatif)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="Informations complémentaires..."
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </label>

              <div className="valuation-info">
                <ShieldCheck size={17} />
                <span>
                  Le solde et la valorisation seront renseignés dans une étape
                  distincte. Aucun montant n'est demandé ici.
                </span>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Enregistrement…"
                    : editingAccount
                      ? "Enregistrer les modifications"
                      : "Créer le compte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

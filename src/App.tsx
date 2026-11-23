
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BriefcaseBusiness,
  ChartNoAxesCombined, ChevronDown, CircleHelp, Coins, LayoutDashboard,
  LogOut, Plus, ShieldCheck, Wallet, Pencil, Trash2, X,
  RefreshCw, CalendarDays, TrendingUp, Package,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell,
} from "recharts";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type {
  Account, AccountType, Asset, AssetType, PortfolioPosition,
} from "./types/database";

type SessionUser = {
  id: string;
  email?: string;
  user_metadata?: { avatar_url?: string; full_name?: string };
};

type Page = "overview" | "accounts" | "investments" | "performance" | "debts";

type ManualValuation = {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  currency: string;
  valuation_date: string;
  note: string | null;
  created_at: string;
};


type Debt = {
  id: string;
  user_id: string;
  name: string;
  debt_type: string;
  initial_amount: number;
  remaining_amount: number;
  monthly_payment: number | null;
  interest_rate: number | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ExchangeRate = {
  date: string;
  base: string;
  quote: string;
  rate: number;
};

type AllocationItem = {
  name: string;
  value: number;
  percentage: number;
  color: string;
};

type HistoryPoint = {
  date: string;
  value: number;
};

type PortfolioDailySnapshot = {
  id: string;
  user_id: string;
  snapshot_date: string;
  total_value_eur: number;
  positions_count: number;
  created_at: string;
};

type Quote = {
  id: string;
  user_id: string;
  asset_id: string;
  price: number;
  currency: string;
  price_eur: number | null;
  provider: string;
  quoted_at: string;
  fetched_at: string;
};

const accountTypes: { value: AccountType; label: string }[] = [
  { value: "pea", label: "PEA" },
  { value: "cto", label: "CTO" },
  { value: "crypto", label: "Cryptomonnaies" },
  { value: "savings", label: "Épargne" },
  { value: "current", label: "Compte courant" },
  { value: "other", label: "Autres" },
];

const assetTypes: { value: AssetType; label: string }[] = [
  { value: "stock", label: "Action" },
  { value: "etf", label: "ETF" },
  { value: "crypto", label: "Cryptomonnaie" },
  { value: "fund", label: "Fonds" },
  { value: "other", label: "Autre" },
];

const allocationColors: Record<AccountType, string> = {
  pea: "#36c9e8",
  cto: "#8b7cf6",
  crypto: "#f0b44c",
  savings: "#42c99a",
  current: "#ed7b9b",
  other: "#8995aa",
};

const navItems = [
  { label: "Vue d’ensemble", icon: LayoutDashboard, page: "overview" as const },
  { label: "Mes comptes", icon: Wallet, page: "accounts" as const },
  { label: "Investissements", icon: ChartNoAxesCombined, page: "investments" as const },
  { label: "Performance globale", icon: TrendingUp, page: "performance" as const },
  { label: "Mes dettes", icon: ArrowDownRight, page: "debts" as const },
];

const emptyForm = {
  name: "",
  account_type: "pea" as AccountType,
  broker: "",
  currency: "EUR",
  notes: "",
};

const emptyAssetForm = {
  name: "",
  ticker: "",
  isin: "",
  asset_type: "etf" as AssetType,
  exchange: "",
  currency: "EUR",
  quote_mode: "manual" as "manual" | "automatic",
  quote_provider: "fmp" as "fmp" | "coingecko",
  quote_symbol: "",
};

const emptyPositionForm = {
  account_id: "",
  asset_id: "",
  quantity: "",
  average_cost: "",
  cost_currency: "EUR",
  opened_at: "",
  notes: "",
};

const debtTypes = [
  { value: "mortgage", label: "Crédit immobilier" },
  { value: "auto", label: "Crédit auto" },
  { value: "personal", label: "Prêt personnel" },
  { value: "revolving", label: "Crédit renouvelable" },
  { value: "other", label: "Autre dette" },
];

const emptyDebtForm = {
  name: "",
  debt_type: "mortgage",
  initial_amount: "",
  remaining_amount: "",
  monthly_payment: "",
  interest_rate: "",
  due_date: "",
  notes: "",
};

function euro(value: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function numberFormat(value: number, digits = 8) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(value);
}

function getAccountTypeLabel(type: AccountType) {
  return accountTypes.find((item) => item.value === type)?.label ?? "Autres";
}

function getAssetTypeLabel(type: AssetType) {
  return assetTypes.find((item) => item.value === type)?.label ?? "Autre";
}

function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  if (!date) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR").format(
    new Date(`${date.slice(0, 10)}T12:00:00`)
  );
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [valuations, setValuations] = useState<ManualValuation[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [portfolioSnapshots, setPortfolioSnapshots] = useState<PortfolioDailySnapshot[]>([]);
  const [portfolioSnapshotsError, setPortfolioSnapshotsError] = useState("");
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [debtForm, setDebtForm] = useState(emptyDebtForm);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [quotesUpdating, setQuotesUpdating] = useState(false);

  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({
    EUR: 1,
  });
  const [exchangeRateDate, setExchangeRateDate] = useState("");
  const [exchangeRateError, setExchangeRateError] = useState("");
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);

  const [historyFxRates, setHistoryFxRates] = useState<ExchangeRate[]>([]);
  const [historyFxLoading, setHistoryFxLoading] = useState(false);
  const [historyFxError, setHistoryFxError] = useState("");

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetForm, setAssetForm] = useState(emptyAssetForm);

  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
  const [positionForm, setPositionForm] = useState(emptyPositionForm);

  const [activePage, setActivePage] = useState<Page>("overview");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [valuationModalAccount, setValuationModalAccount] =
    useState<Account | null>(null);

  const [valuationForm, setValuationForm] = useState({
    amount: "",
    valuation_date: getLocalDate(),
    note: "",
  });

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
      loadData();
    } else {
      setAccounts([]);
      setValuations([]);
      setAssets([]);
      setPositions([]);
      setQuotes([]);
      setPortfolioSnapshots([]);
      setPortfolioSnapshotsError("");
      setDebts([]);
    }
  }, [user?.id]);

  // Taux de change actuels pour le tableau de bord.
  useEffect(() => {
    const currencies = [
      ...new Set([
        ...accounts.map((account) => account.currency || "EUR"),
        ...assets.map((asset) => asset.currency || "EUR"),
        ...positions.map((position) => position.cost_currency || "EUR"),
        ...quotes.map((quote) => quote.currency || "EUR"),
      ]),
    ].filter((currency) => currency !== "EUR");

    if (currencies.length === 0) {
      setExchangeRates({ EUR: 1 });
      setExchangeRateDate("");
      setExchangeRateError("");
      setExchangeRatesLoading(false);
      return;
    }

    let cancelled = false;

    async function loadExchangeRates() {
      setExchangeRatesLoading(true);
      setExchangeRateError("");

      try {
        const quotes = currencies.join(",");
        const response = await fetch(
          `https://api.frankfurter.dev/v2/rates?base=EUR&quotes=${encodeURIComponent(quotes)}`
        );

        if (!response.ok) {
          throw new Error("Impossible de récupérer les taux de change.");
        }

        const data = (await response.json()) as ExchangeRate[];
        const rates: Record<string, number> = { EUR: 1 };

        data.forEach((item) => {
          rates[item.quote] = item.rate;
        });

        const missing = currencies.filter(
          (currency) => !rates[currency] || rates[currency] <= 0
        );

        if (missing.length > 0) {
          throw new Error(`Taux indisponible pour : ${missing.join(", ")}`);
        }

        if (!cancelled) {
          setExchangeRates(rates);
          setExchangeRateDate(
            data.reduce(
              (latest, item) => item.date > latest ? item.date : latest,
              ""
            )
          );
        }
      } catch (err) {
        if (!cancelled) {
          setExchangeRateError(
            err instanceof Error ? err.message : "Erreur de conversion."
          );
        }
      } finally {
        if (!cancelled) {
          setExchangeRatesLoading(false);
        }
      }
    }

    loadExchangeRates();

    return () => {
      cancelled = true;
    };
  }, [accounts, assets, positions, quotes]);

  // Chargement des taux historiques nécessaires au graphique.
  useEffect(() => {
    if (valuations.length === 0) {
      setHistoryFxRates([]);
      setHistoryFxError("");
      setHistoryFxLoading(false);
      return;
    }

    const currencies = [
      ...new Set(
        valuations
          .map((valuation) => valuation.currency || "EUR")
          .filter((currency) => currency !== "EUR")
      ),
    ];

    if (currencies.length === 0) {
      setHistoryFxRates([]);
      setHistoryFxError("");
      setHistoryFxLoading(false);
      return;
    }

    const dates = valuations.map((item) =>
      item.valuation_date.slice(0, 10)
    );
    const firstDate = dates.sort()[0];

    let cancelled = false;

    async function loadHistoricalRates() {
      setHistoryFxLoading(true);
      setHistoryFxError("");

      try {
        const params = new URLSearchParams({
          from: firstDate,
          to: getLocalDate(),
          base: "EUR",
          quotes: currencies.join(","),
        });

        const response = await fetch(
          `https://api.frankfurter.dev/v2/rates?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error("Impossible de récupérer les taux historiques.");
        }

        const data = (await response.json()) as ExchangeRate[];

        if (!cancelled) {
          setHistoryFxRates(data);
        }
      } catch (err) {
        if (!cancelled) {
          setHistoryFxError(
            err instanceof Error
              ? err.message
              : "Erreur lors du chargement des taux historiques."
          );
        }
      } finally {
        if (!cancelled) {
          setHistoryFxLoading(false);
        }
      }
    }

    loadHistoricalRates();

    return () => {
      cancelled = true;
    };
  }, [valuations]);

  const greeting = useMemo(() => {
    const name = user?.user_metadata?.full_name?.split(" ")[0];
    return name ? `Bonjour ${name}` : "Bonjour";
  }, [user]);

  async function loadData() {
    if (!supabase || !user?.id) return;

    setAccountsLoading(true);
    setError("");

    const [
      accountsResult,
      valuationsResult,
      assetsResult,
      positionsResult,
      quotesResult,
      snapshotsResult,
      debtsResult,
    ] = await Promise.all([
      supabase
        .from("accounts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("manual_valuations")
        .select("*")
        .order("valuation_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("assets")
        .select("*")
        .order("name", { ascending: true }),
      supabase
        .from("positions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("quotes")
        .select("*")
        .order("quoted_at", { ascending: false }),
      (supabase as any)
        .from("portfolio_daily_snapshots")
        .select("id,user_id,snapshot_date,total_value_eur,positions_count,created_at")
        .order("snapshot_date", { ascending: true }),
      (supabase as any)
        .from("debts")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (accountsResult.error) {
      setError(
        "Impossible de charger les comptes : " +
          accountsResult.error.message
      );
    } else {
      setAccounts((accountsResult.data ?? []) as Account[]);
    }

    if (valuationsResult.error) {
      setError(
        "Impossible de charger les valorisations : " +
          valuationsResult.error.message
      );
    } else {
      setValuations((valuationsResult.data ?? []) as ManualValuation[]);
    }

    if (assetsResult.error) {
      setError(
        "Impossible de charger les actifs : " +
          assetsResult.error.message
      );
    } else {
      setAssets((assetsResult.data ?? []) as Asset[]);
    }

    if (positionsResult.error) {
      setError(
        "Impossible de charger les positions : " +
          positionsResult.error.message
      );
    } else {
      setPositions((positionsResult.data ?? []) as PortfolioPosition[]);
    }

    if (quotesResult.error) {
      setError(
        "Impossible de charger les cours : " + quotesResult.error.message
      );
    } else {
      setQuotes((quotesResult.data ?? []) as Quote[]);
    }

    if (snapshotsResult.error) {
      setPortfolioSnapshotsError(
        "Impossible de charger l'historique du portefeuille : " + snapshotsResult.error.message
      );
      setPortfolioSnapshots([]);
    } else {
      setPortfolioSnapshots((snapshotsResult.data ?? []) as PortfolioDailySnapshot[]);
      setPortfolioSnapshotsError("");
    }

    if (debtsResult.error) {
      setError(
        "Impossible de charger les dettes : " + debtsResult.error.message +
          " — Vérifie que la table debts a bien été créée dans Supabase."
      );
    } else {
      setDebts((debtsResult.data ?? []) as Debt[]);
    }

    setAccountsLoading(false);
  }

  async function refreshQuotes() {
    if (!supabase || !user?.id || quotesUpdating) return;

    setQuotesUpdating(true);
    setError("");
    setNotice("");

    try {
      const { error: functionError } = await supabase.functions.invoke(
        "update-quotes"
      );

      if (functionError) {
        let details = functionError.message;
        try {
          const context = (functionError as { context?: Response }).context;
          if (context) {
            const body = await context.clone().json();
            details = body?.error || body?.message || details;
          }
        } catch {
          // Le message initial reste disponible si la réponse n'est pas du JSON.
        }
        throw new Error(details);
      }

      await loadData();
      setNotice(
        "Demande d'actualisation terminée. Les derniers cours ont été rechargés lorsqu'ils étaient disponibles."
      );
    } catch (err) {
      setError(
        "Impossible d'actualiser les cours : " +
          (err instanceof Error ? err.message : "Erreur inconnue.")
      );
    } finally {
      setQuotesUpdating(false);
    }
  }

  // Les anciennes valorisations manuelles restent conservées pour l'historique.
  // La valeur actuelle des comptes est calculée plus bas à partir des positions,
  // sauf pour les comptes Épargne qui gardent une valorisation manuelle.

  // Construction de l'historique réel du patrimoine.
  const historyData = useMemo((): HistoryPoint[] => {
    if (valuations.length === 0 || historyFxError) return [];

    const dates = [
      ...new Set(
        valuations.map((item) => item.valuation_date.slice(0, 10))
      ),
    ].sort();

    return dates.map((date) => {
      let total = 0;

      for (const account of accounts) {
        const accountValuations = valuations
          .filter(
            (item) =>
              item.account_id === account.id &&
              item.valuation_date.slice(0, 10) <= date
          )
          .sort((a, b) => {
            const dateComparison =
              b.valuation_date.localeCompare(a.valuation_date);
            if (dateComparison !== 0) return dateComparison;
            return b.created_at.localeCompare(a.created_at);
          });

        const valuation = accountValuations[0];
        if (!valuation) continue;

        const amount = Number(valuation.amount);
        if (!Number.isFinite(amount)) continue;

        const currency = valuation.currency || account.currency || "EUR";

        if (currency === "EUR") {
          total += amount;
          continue;
        }

        const applicableRate = historyFxRates
          .filter(
            (rate) =>
              rate.quote === currency &&
              rate.date <= date &&
              rate.rate > 0
          )
          .sort((a, b) => b.date.localeCompare(a.date))[0];

        if (!applicableRate) {
          return { date, value: Number.NaN };
        }

        total += amount / applicableRate.rate;
      }

      return { date, value: total };
    });
  }, [accounts, valuations, historyFxRates, historyFxError]);

  const historyHasInvalidValues = historyData.some(
    (point) => !Number.isFinite(point.value)
  );

  // Valorisation des positions à partir du dernier cours disponible.
  const investmentRows = useMemo(() => {
    const latestQuoteByAsset = new Map<string, Quote>();

    for (const quote of quotes) {
      const current = latestQuoteByAsset.get(quote.asset_id);
      if (!current || quote.quoted_at > current.quoted_at) {
        latestQuoteByAsset.set(quote.asset_id, quote);
      }
    }

    const toEuros = (amount: number, currency: string): number | null => {
      if (!Number.isFinite(amount)) return null;
      if (currency === "EUR") return amount;
      const rate = exchangeRates[currency];
      if (!rate || rate <= 0) return null;
      return amount / rate;
    };

    return positions.map((position) => {
      const asset = assets.find((item) => item.id === position.asset_id);
      const account = accounts.find((item) => item.id === position.account_id);
      const quote = latestQuoteByAsset.get(position.asset_id);
      const quantity = Number(position.quantity);
      const averageCost = Number(position.average_cost);
      const costCurrency = position.cost_currency || "EUR";
      const costAmount = quantity * averageCost;
      const costInEuros = toEuros(costAmount, costCurrency);

      let unitPriceInEuros: number | null = null;
      if (quote && Number.isFinite(Number(quote.price)) && Number(quote.price) > 0) {
        if (quote.price_eur !== null && Number.isFinite(Number(quote.price_eur)) && Number(quote.price_eur) > 0) {
          unitPriceInEuros = Number(quote.price_eur);
        } else {
          unitPriceInEuros = toEuros(Number(quote.price), quote.currency || asset?.currency || "EUR");
        }
      }

      const marketValueInEuros = unitPriceInEuros === null
        ? null
        : quantity * unitPriceInEuros;
      const gainLossInEuros = marketValueInEuros === null || costInEuros === null
        ? null
        : marketValueInEuros - costInEuros;
      const gainLossPercent = gainLossInEuros === null || costInEuros === null || costInEuros <= 0
        ? null
        : (gainLossInEuros / costInEuros) * 100;

      return {
        position,
        asset,
        account,
        quote,
        costAmount,
        costInEuros,
        unitPriceInEuros,
        marketValueInEuros,
        gainLossInEuros,
        gainLossPercent,
      };
    });
  }, [positions, assets, accounts, quotes, exchangeRates]);

  const totalPositions = positions.length;

  // Les totaux ne comprennent que les positions dont le cours et les conversions sont disponibles.
  const investmentTotals = useMemo(() => {
    const pricedRows = investmentRows.filter(
      (row) => row.marketValueInEuros !== null && row.costInEuros !== null
    );
    const marketValue = pricedRows.reduce((sum, row) => sum + (row.marketValueInEuros ?? 0), 0);
    const costBasis = pricedRows.reduce((sum, row) => sum + (row.costInEuros ?? 0), 0);
    const gainLoss = marketValue - costBasis;
    return {
      marketValue,
      costBasis,
      gainLoss,
      gainLossPercent: costBasis > 0 ? (gainLoss / costBasis) * 100 : null,
      pricedCount: pricedRows.length,
      missingCount: positions.length - pricedRows.length,
    };
  }, [investmentRows, positions.length]);

  // Synthèse dédiée à la page Performance globale. Le coût d'achat inclut
  // toutes les positions dont le prix moyen est convertible en euros ; la
  // performance n'est calculée que sur les positions disposant aussi d'un cours.
  const performanceSummary = useMemo(() => {
    const rowsWithCost = investmentRows.filter((row) => row.costInEuros !== null);
    const pricedRows = rowsWithCost.filter((row) => row.marketValueInEuros !== null);
    const investedCapital = rowsWithCost.reduce(
      (sum, row) => sum + (row.costInEuros ?? 0), 0
    );
    const pricedCost = pricedRows.reduce(
      (sum, row) => sum + (row.costInEuros ?? 0), 0
    );
    const marketValue = pricedRows.reduce(
      (sum, row) => sum + (row.marketValueInEuros ?? 0), 0
    );
    const gainLoss = marketValue - pricedCost;

    return {
      investedCapital,
      pricedCost,
      marketValue,
      gainLoss,
      gainLossPercent: pricedCost > 0 ? (gainLoss / pricedCost) * 100 : null,
      pricedCount: pricedRows.length,
      missingCount: positions.length - pricedRows.length,
    };
  }, [investmentRows, positions.length]);

  // Historique réel : chaque point provient d'un relevé quotidien enregistré
  // dans Supabase. Les relevés sont déjà limités au CTO, PEA et crypto par
  // la fonction serveur record-portfolio-snapshot.
  const investmentHistoryData = useMemo((): HistoryPoint[] => {
    return portfolioSnapshots
      .map((snapshot) => ({
        date: snapshot.snapshot_date.slice(0, 10),
        value: Number(snapshot.total_value_eur),
      }))
      .filter((point) =>
        Boolean(point.date) && Number.isFinite(point.value) && point.value >= 0
      );
  }, [portfolioSnapshots]);

  // Valeur actuelle de chaque compte : positions pour tous les comptes sauf Épargne.
  const accountValuations = useMemo(() => {
    return accounts.map((account) => {
      if (account.account_type === "savings") {
        const valuation = valuations
          .filter((item) => item.account_id === account.id)
          .sort((a, b) => {
            const dateComparison = b.valuation_date.localeCompare(a.valuation_date);
            if (dateComparison !== 0) return dateComparison;
            return b.created_at.localeCompare(a.created_at);
          })[0];

        if (!valuation) {
          return {
            account,
            valueInEuros: null as number | null,
            positionCount: 0,
            missingCount: 0,
            gainLossInEuros: null as number | null,
            gainLossPercent: null as number | null,
            valuationDate: null as string | null,
            isComplete: false,
            status: "Aucune valorisation enregistrée",
          };
        }

        const amount = Number(valuation.amount);
        const currency = valuation.currency || account.currency || "EUR";
        const rate = currency === "EUR" ? 1 : exchangeRates[currency];
        const valueInEuros = Number.isFinite(amount) && rate && rate > 0
          ? amount / rate
          : null;

        return {
          account,
          valueInEuros,
          positionCount: 0,
          missingCount: valueInEuros === null ? 1 : 0,
          gainLossInEuros: null as number | null,
          gainLossPercent: null as number | null,
          valuationDate: valuation.valuation_date,
          isComplete: valueInEuros !== null,
          status: valueInEuros === null
            ? "Conversion indisponible"
            : `Dernière valorisation : ${formatDate(valuation.valuation_date)}`,
        };
      }

      const rows = investmentRows.filter((row) => row.position.account_id === account.id);
      const pricedRows = rows.filter((row) => row.marketValueInEuros !== null);
      const performanceRows = pricedRows.filter((row) => row.costInEuros !== null);
      const missingCount = rows.length - pricedRows.length;
      const valueInEuros = pricedRows.reduce(
        (sum, row) => sum + (row.marketValueInEuros ?? 0),
        0
      );
      const gainLossInEuros = performanceRows.length > 0
        ? performanceRows.reduce((sum, row) => sum + (row.gainLossInEuros ?? 0), 0)
        : null;
      const investedInEuros = performanceRows.reduce(
        (sum, row) => sum + (row.costInEuros ?? 0),
        0
      );

      return {
        account,
        valueInEuros,
        positionCount: rows.length,
        missingCount,
        gainLossInEuros,
        gainLossPercent: gainLossInEuros !== null && investedInEuros > 0
          ? (gainLossInEuros / investedInEuros) * 100
          : null,
        valuationDate: null as string | null,
        isComplete: missingCount === 0,
        status: rows.length === 0
          ? "Aucune position rattachée"
          : missingCount > 0
            ? `${pricedRows.length}/${rows.length} position(s) valorisée(s)`
            : `${rows.length} position(s) valorisée(s) automatiquement`,
      };
    });
  }, [accounts, valuations, investmentRows, exchangeRates]);

  const totalAccounts = accounts.length;
  const valuedAccounts = accountValuations.filter(
    (item) => item.valueInEuros !== null && item.isComplete &&
      (item.account.account_type === "savings" || item.positionCount > 0)
  ).length;
  const unvaluedAccounts = totalAccounts - valuedAccounts;

  const totalInEuros = useMemo(() => {
    if (exchangeRateError || accountValuations.some((item) => !item.isComplete)) {
      return null;
    }

    return accountValuations.reduce(
      (total, item) => total + (item.valueInEuros ?? 0),
      0
    );
  }, [accountValuations, exchangeRateError]);

  // Répartition calculée sur les valeurs actuelles des positions et de l'épargne.
  const allocationData = useMemo((): AllocationItem[] => {
    if (exchangeRateError || accountValuations.some((item) => !item.isComplete)) return [];

    const totals: Partial<Record<AccountType, number>> = {};

    for (const item of accountValuations) {
      if (item.valueInEuros === null) continue;
      const category = item.account.account_type;
      totals[category] = (totals[category] ?? 0) + item.valueInEuros;
    }

    const total = Object.values(totals).reduce(
      (sum, value) => sum + (value ?? 0),
      0
    );
    if (total <= 0) return [];

    return accountTypes
      .map((type) => {
        const value = totals[type.value] ?? 0;
        return {
          name: type.label,
          value,
          percentage: (value / total) * 100,
          color: allocationColors[type.value],
        };
      })
      .filter((item) => item.value > 0);
  }, [accountValuations, exchangeRateError]);

  const allocationTotal = useMemo(
    () => allocationData.reduce((sum, item) => sum + item.value, 0),
    [allocationData]
  );

  function openAccountDetails(account: Account) {
    setSelectedAccountId(account.id);
    setActivePage("accounts");
    setNotice("");
    setError("");
  }

  function backToAccounts() {
    setSelectedAccountId(null);
    setNotice("");
    setError("");
  }

  async function signIn() {
    if (!supabase) return;

    setSaving(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
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
    setNotice(
      editingAccount
        ? "Compte modifié avec succès."
        : "Compte ajouté avec succès."
    );

    await loadData();
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
    await loadData();
  }

  function openValuationModal(account: Account) {
    setValuationModalAccount(account);
    setValuationForm({
      amount: "",
      valuation_date: getLocalDate(),
      note: "",
    });
    setError("");
    setNotice("");
  }

  async function saveValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user?.id || !valuationModalAccount) return;

    const amount = Number(valuationForm.amount.replace(",", "."));

    if (!Number.isFinite(amount) || amount < 0) {
      setError("Saisis un montant valide, supérieur ou égal à zéro.");
      return;
    }

    if (!valuationForm.valuation_date) {
      setError("La date de valorisation est obligatoire.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const { error } = await supabase
      .from("manual_valuations")
      .insert({
        user_id: user.id,
        account_id: valuationModalAccount.id,
        amount,
        currency: valuationModalAccount.currency || "EUR",
        valuation_date: valuationForm.valuation_date,
        note: valuationForm.note.trim() || null,
      });

    if (error) {
      setError("Erreur lors de l'enregistrement : " + error.message);
      setSaving(false);
      return;
    }

    setValuationModalAccount(null);
    setValuationForm({
      amount: "",
      valuation_date: getLocalDate(),
      note: "",
    });
    setNotice("Valorisation enregistrée avec succès.");

    await loadData();
    setSaving(false);
  }

  // Gestion des actifs.
  function openCreateAssetModal() {
    setEditingAsset(null);
    setAssetForm(emptyAssetForm);
    setError("");
    setAssetModalOpen(true);
  }

  function openEditAssetModal(asset: Asset) {
    setEditingAsset(asset);
    const quoteSettings = asset as Asset & {
      is_manual_quote?: boolean;
      quote_provider?: string | null;
      quote_symbol?: string | null;
    };

    setAssetForm({
      name: asset.name,
      ticker: asset.ticker ?? "",
      isin: asset.isin ?? "",
      asset_type: asset.asset_type,
      exchange: asset.exchange ?? "",
      currency: asset.currency || "EUR",
      quote_mode: quoteSettings.is_manual_quote === false ? "automatic" : "manual",
      quote_provider: quoteSettings.quote_provider === "coingecko" ? "coingecko" : "fmp",
      quote_symbol: quoteSettings.quote_symbol ?? "",
    });
    setError("");
    setAssetModalOpen(true);
  }

  async function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user?.id) return;

    if (!assetForm.name.trim()) {
      setError("Le nom de l'actif est obligatoire.");
      return;
    }

    if (assetForm.quote_mode === "automatic" && !assetForm.quote_symbol.trim()) {
      setError("Renseigne le symbole attendu par le fournisseur de cotation.");
      return;
    }

    if (
      assetForm.quote_mode === "automatic" &&
      assetForm.asset_type === "crypto" &&
      assetForm.quote_provider !== "coingecko"
    ) {
      setError("Pour une cryptomonnaie, sélectionne CoinGecko.");
      return;
    }

    if (
      assetForm.quote_mode === "automatic" &&
      assetForm.asset_type !== "crypto" &&
      assetForm.quote_provider !== "fmp"
    ) {
      setError("Pour une action ou un ETF, sélectionne Financial Modeling Prep.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: assetForm.name.trim(),
      ticker: assetForm.ticker.trim().toUpperCase() || null,
      isin: assetForm.isin.trim().toUpperCase() || null,
      asset_type: assetForm.asset_type,
      exchange: assetForm.exchange.trim() || null,
      currency: assetForm.currency,
      is_manual_quote: assetForm.quote_mode === "manual",
      quote_provider:
        assetForm.quote_mode === "automatic" ? assetForm.quote_provider : null,
      quote_symbol:
        assetForm.quote_mode === "automatic"
          ? assetForm.quote_symbol.trim()
          : null,
    };

    // Les colonnes de cotation sont présentes dans Supabase mais peuvent ne pas
    // encore figurer dans le type Asset généré localement.
    const result = editingAsset
      ? await supabase
          .from("assets")
          .update(payload as never)
          .eq("id", editingAsset.id)
          .select()
          .single()
      : await supabase
          .from("assets")
          .insert({
            ...payload,
            user_id: user.id,
          } as never)
          .select()
          .single();

    if (result.error) {
      setError(
        "Impossible d'enregistrer cet actif : " + result.error.message
      );
      setSaving(false);
      return;
    }

    setAssetModalOpen(false);
    setEditingAsset(null);
    setAssetForm(emptyAssetForm);
    setNotice(
      editingAsset
        ? "Actif modifié avec succès."
        : "Actif ajouté avec succès."
    );

    await loadData();
    setSaving(false);
  }

  // Gestion des positions.
  function openCreatePositionModal() {
    if (accounts.length === 0) {
      setError("Ajoute d'abord un compte avant de créer une position.");
      return;
    }

    if (assets.length === 0) {
      setError("Ajoute d'abord un actif avant de créer une position.");
      return;
    }

    setEditingPosition(null);
    setPositionForm({
      ...emptyPositionForm,
      account_id: accounts[0]?.id ?? "",
      asset_id: assets[0]?.id ?? "",
      cost_currency: assets[0]?.currency ?? "EUR",
    });
    setError("");
    setNotice("");
    setPositionModalOpen(true);
  }

  function openEditPositionModal(position: PortfolioPosition) {
    setEditingPosition(position);
    setPositionForm({
      account_id: position.account_id,
      asset_id: position.asset_id,
      quantity: String(position.quantity),
      average_cost: String(position.average_cost),
      cost_currency: position.cost_currency || "EUR",
      opened_at: position.opened_at ?? "",
      notes: position.notes ?? "",
    });
    setError("");
    setNotice("");
    setPositionModalOpen(true);
  }

  async function savePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !user?.id) return;

    const quantity = Number(positionForm.quantity.replace(",", "."));
    const averageCost = Number(positionForm.average_cost.replace(",", "."));

    if (!positionForm.account_id || !positionForm.asset_id) {
      setError("Sélectionne un compte et un actif.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      setError("La quantité doit être un nombre positif ou égal à zéro.");
      return;
    }

    if (!Number.isFinite(averageCost) || averageCost < 0) {
      setError("Le prix moyen doit être un nombre positif ou égal à zéro.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      account_id: positionForm.account_id,
      asset_id: positionForm.asset_id,
      quantity,
      average_cost: averageCost,
      cost_currency: positionForm.cost_currency,
      opened_at: positionForm.opened_at || null,
      notes: positionForm.notes.trim() || null,
    };

    const result = editingPosition
      ? await supabase
          .from("positions")
          .update(payload)
          .eq("id", editingPosition.id)
          .select()
          .single()
      : await supabase
          .from("positions")
          .insert({
            ...payload,
            user_id: user.id,
          })
          .select()
          .single();

    if (result.error) {
      let message = result.error.message;

      if (result.error.code === "23505") {
        message =
          "Une position existe déjà pour cet actif dans ce compte. Modifie la position existante plutôt que d'en créer une deuxième.";
      }

      setError("Impossible d'enregistrer la position : " + message);
      setSaving(false);
      return;
    }

    setPositionModalOpen(false);
    setEditingPosition(null);
    setPositionForm(emptyPositionForm);
    setNotice(
      editingPosition
        ? "Position modifiée avec succès."
        : "Position ajoutée avec succès."
    );

    await loadData();
    setSaving(false);
  }

  async function deletePosition(position: PortfolioPosition) {
    if (!supabase) return;

    const asset = assets.find((item) => item.id === position.asset_id);
    const confirmed = window.confirm(
      `Veux-tu vraiment supprimer la position « ${asset?.name ?? "Actif"} » ?`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    const { error } = await supabase
      .from("positions")
      .delete()
      .eq("id", position.id);

    if (error) {
      setError("Impossible de supprimer cette position : " + error.message);
      return;
    }

    setNotice("Position supprimée.");
    await loadData();
  }


  function openCreateDebtModal() {
    setEditingDebt(null);
    setDebtForm(emptyDebtForm);
    setError("");
    setNotice("");
    setDebtModalOpen(true);
  }

  function openEditDebtModal(debt: Debt) {
    setEditingDebt(debt);
    setDebtForm({
      name: debt.name,
      debt_type: debt.debt_type,
      initial_amount: String(debt.initial_amount),
      remaining_amount: String(debt.remaining_amount),
      monthly_payment: debt.monthly_payment === null ? "" : String(debt.monthly_payment),
      interest_rate: debt.interest_rate === null ? "" : String(debt.interest_rate),
      due_date: debt.due_date ?? "",
      notes: debt.notes ?? "",
    });
    setError("");
    setNotice("");
    setDebtModalOpen(true);
  }

  async function saveDebt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user?.id) return;

    const initialAmount = Number(debtForm.initial_amount.replace(",", "."));
    const remainingAmount = Number(debtForm.remaining_amount.replace(",", "."));
    const monthlyPayment = debtForm.monthly_payment.trim()
      ? Number(debtForm.monthly_payment.replace(",", "."))
      : null;
    const interestRate = debtForm.interest_rate.trim()
      ? Number(debtForm.interest_rate.replace(",", "."))
      : null;

    if (!debtForm.name.trim()) {
      setError("Le nom de la dette est obligatoire.");
      return;
    }
    if (!Number.isFinite(initialAmount) || initialAmount <= 0) {
      setError("Le montant initial doit être supérieur à zéro.");
      return;
    }
    if (!Number.isFinite(remainingAmount) || remainingAmount < 0) {
      setError("Le capital restant dû doit être un montant valide, supérieur ou égal à zéro.");
      return;
    }
    if (monthlyPayment !== null && (!Number.isFinite(monthlyPayment) || monthlyPayment < 0)) {
      setError("La mensualité doit être un montant valide ou rester vide.");
      return;
    }
    if (interestRate !== null && (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100)) {
      setError("Le taux d'intérêt doit être compris entre 0 et 100 %.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: debtForm.name.trim(),
      debt_type: debtForm.debt_type,
      initial_amount: initialAmount,
      remaining_amount: remainingAmount,
      monthly_payment: monthlyPayment,
      interest_rate: interestRate,
      due_date: debtForm.due_date || null,
      notes: debtForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const table = (supabase as any).from("debts");
    const result = editingDebt
      ? await table.update(payload).eq("id", editingDebt.id).select().single()
      : await table.insert({ ...payload, user_id: user.id }).select().single();

    if (result.error) {
      setError("Impossible d'enregistrer la dette : " + result.error.message);
      setSaving(false);
      return;
    }

    setDebtModalOpen(false);
    setEditingDebt(null);
    setDebtForm(emptyDebtForm);
    setNotice(editingDebt ? "Dette modifiée avec succès." : "Dette ajoutée avec succès.");
    await loadData();
    setSaving(false);
  }

  async function deleteDebt(debt: Debt) {
    if (!supabase) return;
    const confirmed = window.confirm(`Veux-tu vraiment supprimer la dette « ${debt.name} » ?`);
    if (!confirmed) return;

    setError("");
    setNotice("");
    const { error } = await (supabase as any).from("debts").delete().eq("id", debt.id);
    if (error) {
      setError("Impossible de supprimer cette dette : " + error.message);
      return;
    }
    setNotice("Dette supprimée.");
    await loadData();
  }

  const totalDebtRemaining = debts.reduce(
    (total, debt) => total + Number(debt.remaining_amount || 0),
    0
  );

  function getDebtTypeLabel(type: string) {
    return debtTypes.find((item) => item.value === type)?.label ?? "Autre dette";
  }

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const selectedAccountSummary = selectedAccount
    ? accountValuations.find((item) => item.account.id === selectedAccount.id)
    : null;
  const selectedAccountRows = selectedAccount
    ? investmentRows.filter((row) => row.position.account_id === selectedAccount.id)
    : [];

  const pageTitle =
    activePage === "overview"
      ? "Vue d’ensemble"
      : activePage === "accounts"
        ? "Mes comptes"
        : activePage === "investments"
          ? "Investissements"
          : activePage === "performance"
            ? "Performance globale"
            : "Mes dettes";

  const totalDisplay = () => {
    if (!user) return "— €";
    if (accountsLoading) return "Chargement…";
    if (exchangeRatesLoading) return "Conversion…";
    if (exchangeRateError) return "Indisponible";
    if (totalInEuros === null) return "Valorisation incomplète";
    return euro(totalInEuros);
  };

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
                  setSelectedAccountId(null);
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
                <button
                  className="primary-button"
                  onClick={openCreateModal}
                  disabled={!user}
                >
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

              {authLoading && (
                <div className="notice">Vérification de la connexion…</div>
              )}

              {!user && !authLoading && isSupabaseConfigured && (
                <div className="setup-alert login-alert">
                  <div>
                    <strong>Connecte ton espace Finova</strong>
                    <p>
                      Connecte-toi avec ton compte Google pour accéder à tes données.
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={signIn}
                    disabled={saving}
                  >
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
                    <span>Patrimoine valorisé</span>
                    <span className="metric-icon"><Wallet size={17} /></span>
                  </div>
                  <div className="metric-value">{totalDisplay()}</div>
                  <div className="metric-foot">
                    <span className="neutral-pill">
                      {valuedAccounts} / {totalAccounts} comptes
                    </span>
                    <span className="muted">
                      {unvaluedAccounts > 0
                        ? `${unvaluedAccounts} compte(s) à compléter ou sans cours`
                        : "Comptes valorisés"}
                    </span>
                  </div>
                  {exchangeRateError && (
                    <p className="muted">{exchangeRateError}</p>
                  )}
                  {exchangeRateDate && !exchangeRateError && (
                    <p className="muted">
                      Taux de change du {formatDate(exchangeRateDate)}
                    </p>
                  )}
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>Investissements valorisés</span>
                    <span className="metric-icon"><BriefcaseBusiness size={17} /></span>
                  </div>
                  <div className="metric-value">{investmentTotals.pricedCount > 0 ? euro(investmentTotals.marketValue) : "— €"}</div>
                  <div className="metric-foot muted">
                    Valeur de marché des positions cotées
                  </div>
                </article>

                <article
                  className="metric-card"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => setActivePage("debts")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setActivePage("debts");
                  }}
                >
                  <div className="metric-top">
                    <span>Dettes</span>
                    <span className="metric-icon"><ArrowDownRight size={17} /></span>
                  </div>
                  <div className="metric-value" style={{ fontSize: 19 }}>Voir le suivi</div>
                  <div className="metric-foot muted">
                    Suivi indépendant du patrimoine
                  </div>
                </article>

                <article
                  className="metric-card"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setActivePage("performance");
                    setNotice("");
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setActivePage("performance");
                      setNotice("");
                      setError("");
                    }
                  }}
                >
                  <div className="metric-top">
                    <span>Performance globale</span>
                    <span className="metric-icon"><ArrowUpRight size={17} /></span>
                  </div>
                  <div
                    className="metric-value"
                    style={{
                      color: investmentTotals.gainLoss === 0
                        ? undefined
                        : investmentTotals.gainLoss > 0
                          ? "#42c99a"
                          : "#ed7b9b",
                    }}
                  >
                    {investmentTotals.pricedCount > 0
                      ? `${investmentTotals.gainLoss > 0 ? "+" : ""}${euro(investmentTotals.gainLoss)}`
                      : "—"}
                  </div>
                  <div className="metric-foot muted">
                    Performance des positions cotées
                  </div>
                </article>
              </section>

              <section className="content-grid">
                <article className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Évolution du patrimoine</h2>
                      <p className="muted">
                        Historique de valorisation enregistré
                      </p>
                    </div>
                    <span className="period-button">Depuis le début</span>
                  </div>

                  <div className="chart-placeholder">
                    {accountsLoading || historyFxLoading ? (
                      <div className="empty-chart">
                        <RefreshCw size={27} />
                        <strong>Chargement de ton historique…</strong>
                        <span>Calcul des valorisations et des taux de change.</span>
                      </div>
                    ) : valuations.length === 0 ? (
                      <div className="empty-chart">
                        <ChartNoAxesCombined size={27} />
                        <strong>Ton historique apparaîtra ici</strong>
                        <span>
                          Ajoute tes premières valorisations pour commencer.
                        </span>
                      </div>
                    ) : historyFxError ? (
                      <div className="empty-chart">
                        <CircleHelp size={27} />
                        <strong>Historique momentanément indisponible</strong>
                        <span>{historyFxError}</span>
                      </div>
                    ) : historyHasInvalidValues ? (
                      <div className="empty-chart">
                        <CircleHelp size={27} />
                        <strong>Conversion historique incomplète</strong>
                        <span>
                          Un taux de change manque pour certaines dates de valorisation.
                        </span>
                      </div>
                    ) : historyData.length === 0 ? (
                      <div className="empty-chart">
                        <ChartNoAxesCombined size={27} />
                        <strong>Pas encore assez de données</strong>
                        <span>
                          Enregistre une valorisation pour afficher ton historique.
                        </span>
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: 290 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={historyData}
                            margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
                          >
                            <defs>
                              <linearGradient
                                id="historyFill"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#202a40" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="date"
                              stroke="#69758e"
                              tickFormatter={formatShortDate}
                              tick={{ fontSize: 11 }}
                              minTickGap={25}
                            />
                            <YAxis
                              stroke="#69758e"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) =>
                                new Intl.NumberFormat("fr-FR", {
                                  notation: "compact",
                                  maximumFractionDigits: 1,
                                }).format(value) + " €"
                              }
                              width={65}
                            />
                            <Tooltip
                              labelFormatter={(label) =>
                                `Valorisation du ${formatDate(String(label))}`
                              }
                              formatter={(value) => [euro(Number(value)), "Patrimoine"]}
                              contentStyle={{
                                background: "#151e30",
                                border: "1px solid #29364e",
                                borderRadius: 10,
                                color: "#ffffff",
                              }}
                              itemStyle={{ color: "#ffffff" }}
                            />
                            <Area
                              type="monotone"
                              dataKey="value"
                              stroke="#A78BFA"
                              strokeWidth={2.5}
                              fill="url(#historyFill)"
                              activeDot={{
                                r: 5,
                                stroke: "#A78BFA",
                                strokeWidth: 2,
                                fill: "#151e30",
                              }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {historyData.length > 0 && !historyHasInvalidValues && (
                    <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                      Historique calculé à partir des valorisations enregistrées.
                      Les comptes apparaissent à partir de leur première valorisation.
                    </p>
                  )}
                </article>

                <article className="panel allocation-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Répartition du patrimoine</h2>
                      <p className="muted">Par grande catégorie</p>
                    </div>
                  </div>

                  {accountsLoading || exchangeRatesLoading ? (
                    <div className="allocation-empty">
                      <RefreshCw size={24} />
                      <p>Calcul de la répartition…</p>
                    </div>
                  ) : exchangeRateError ? (
                    <div className="allocation-empty">
                      <CircleHelp size={24} />
                      <p>
                        La répartition est momentanément indisponible à cause des taux de change.
                      </p>
                    </div>
                  ) : allocationData.length === 0 ? (
                    <div className="allocation-empty">
                      <div className="donut">
                        <span>—<small>EUR</small></span>
                      </div>
                      <p>
                        Ajoute des positions ou valorise ton épargne. La répartition s'affichera lorsque tous les cours seront disponibles.
                      </p>
                    </div>
                  ) : (
                    <div style={{ width: "100%" }}>
                      <div style={{ position: "relative", width: "100%", height: 225 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={allocationData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={65}
                              outerRadius={92}
                              paddingAngle={3}
                              stroke="none"
                            >
                              {allocationData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) => euro(Number(value))}
                              contentStyle={{
                                background: "#151e30",
                                border: "1px solid #29364e",
                                borderRadius: 10,
                                color: "#ffffff",
                              }}
                              itemStyle={{ color: "#ffffff" }}
                            />
                          </PieChart>
                        </ResponsiveContainer>

                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            pointerEvents: "none",
                          }}
                        >
                          <strong style={{ fontSize: 19, color: "#ffffff" }}>
                            {euro(allocationTotal)}
                          </strong>
                          <span style={{ fontSize: 11, color: "#8995aa" }}>
                            PATRIMOINE
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 13,
                          padding: "4px 8px 12px",
                        }}
                      >
                        {allocationData.map((item) => (
                          <div
                            key={item.name}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  minWidth: 10,
                                  borderRadius: "50%",
                                  background: item.color,
                                }}
                              />
                              <span style={{ color: "#c5cede", fontSize: 13 }}>
                                {item.name}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
                              <strong style={{ color: "#ffffff", fontSize: 13 }}>
                                {euro(item.value)}
                              </strong>
                              <span style={{ color: "#8995aa", fontSize: 12, minWidth: 42, textAlign: "right" }}>
                                {item.percentage.toFixed(1).replace(".", ",")} %
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              </section>
            </>
          )}

          {(activePage === "overview" || activePage === "accounts") && (
            <section className="panel bottom-panel">
              <div className="panel-heading" style={{ marginBottom: 18 }}>
                <div>
                  <h2>
                    {selectedAccount && activePage === "accounts"
                      ? selectedAccount.name
                      : activePage === "overview" ? "Mes comptes" : "Mes comptes et enveloppes"}
                  </h2>
                  <p className="muted">
                    {selectedAccount && activePage === "accounts"
                      ? "Informations du compte et positions associées"
                      : activePage === "overview"
                        ? "Tous tes comptes et enveloppes au même endroit"
                        : "Sélectionne un compte pour consulter son détail et ses positions"}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {selectedAccount && activePage === "accounts" && (
                    <button className="secondary-button" onClick={backToAccounts}>
                      <ChevronDown size={15} style={{ transform: "rotate(90deg)" }} /> Retour aux comptes
                    </button>
                  )}
                  {!selectedAccount && (
                    <button className="text-button" onClick={openCreateModal} disabled={!user}>
                      <Plus size={15} /> Ajouter un compte
                    </button>
                  )}
                </div>
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
              ) : selectedAccount && activePage === "accounts" ? (
                <div style={{ display: "grid", gap: 18 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                    <div className="metric-card" style={{ minHeight: 0 }}>
                      <div className="metric-top"><span>Valeur actuelle</span><span className="metric-icon"><Wallet size={17} /></span></div>
                      <div className="metric-value" style={{ fontSize: 23 }}>
                        {selectedAccountSummary?.valueInEuros === null || !selectedAccountSummary
                          ? "— €" : euro(selectedAccountSummary.valueInEuros)}
                      </div>
                      <div className="metric-foot muted">{selectedAccountSummary?.status ?? "Valorisation indisponible"}</div>
                    </div>
                    <div className="metric-card" style={{ minHeight: 0 }}>
                      <div className="metric-top"><span>Plus / moins-value latente</span><span className="metric-icon"><TrendingUp size={17} /></span></div>
                      <div className="metric-value" style={{ fontSize: 23, color: selectedAccountSummary?.gainLossInEuros === null || selectedAccountSummary?.gainLossInEuros === undefined ? "#f0f5ff" : selectedAccountSummary.gainLossInEuros >= 0 ? "#42c99a" : "#ed7b9b" }}>
                        {selectedAccountSummary?.gainLossInEuros === null || selectedAccountSummary?.gainLossInEuros === undefined
                          ? "—" : `${selectedAccountSummary.gainLossInEuros > 0 ? "+" : ""}${euro(selectedAccountSummary.gainLossInEuros)}`}
                      </div>
                      <div className="metric-foot muted">
                        {selectedAccountSummary?.gainLossPercent === null || selectedAccountSummary?.gainLossPercent === undefined
                          ? "Performance non disponible"
                          : `${selectedAccountSummary.gainLossPercent > 0 ? "+" : ""}${selectedAccountSummary.gainLossPercent.toFixed(2).replace(".", ",")} %`}
                      </div>
                    </div>
                    <div className="metric-card" style={{ minHeight: 0 }}>
                      <div className="metric-top"><span>Positions associées</span><span className="metric-icon"><BriefcaseBusiness size={17} /></span></div>
                      <div className="metric-value" style={{ fontSize: 23 }}>{selectedAccountSummary?.positionCount ?? 0}</div>
                      <div className="metric-foot muted">{selectedAccountSummary?.missingCount ?? 0} position(s) sans valorisation disponible</div>
                    </div>
                  </div>

                  <div className="panel" style={{ padding: 16 }}>
                    <div className="panel-heading" style={{ marginBottom: 12 }}>
                      <div><h2>Informations du compte</h2><p className="muted">Détails enregistrés</p></div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {selectedAccount.account_type === "savings" && (
                          <button className="secondary-button" onClick={() => openValuationModal(selectedAccount)}><Plus size={14} /> Valoriser</button>
                        )}
                        <button className="icon-button" title="Modifier le compte" onClick={() => openEditModal(selectedAccount)}><Pencil size={16} /></button>
                        <button className="icon-button" title="Supprimer le compte" onClick={() => deleteAccount(selectedAccount)}><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, color: "#c5cede", fontSize: 12 }}>
                      <div><span className="muted">Type</span><div>{getAccountTypeLabel(selectedAccount.account_type)}</div></div>
                      <div><span className="muted">Établissement / courtier</span><div>{selectedAccount.broker || "Non renseigné"}</div></div>
                      <div><span className="muted">Devise</span><div>{selectedAccount.currency || "EUR"}</div></div>
                      {selectedAccount.notes && <div style={{ gridColumn: "1 / -1" }}><span className="muted">Notes</span><div style={{ whiteSpace: "pre-wrap" }}>{selectedAccount.notes}</div></div>}
                    </div>
                  </div>

                  <div className="panel" style={{ padding: 16 }}>
                    <div className="panel-heading" style={{ marginBottom: 12 }}>
                      <div><h2>Positions de ce compte</h2><p className="muted">Les investissements rattachés à {selectedAccount.name}</p></div>
                      <button className="text-button" onClick={() => { setPositionForm({ ...emptyPositionForm, account_id: selectedAccount.id, asset_id: assets[0]?.id ?? "", cost_currency: assets[0]?.currency ?? "EUR" }); setEditingPosition(null); setError(""); setPositionModalOpen(true); }} disabled={assets.length === 0}>
                        <Plus size={15} /> Ajouter une position
                      </button>
                    </div>
                    {selectedAccountRows.length === 0 ? (
                      <div className="account-empty"><BriefcaseBusiness size={22} /><div><strong>Aucune position associée</strong><span>Ce compte ne contient actuellement aucun investissement enregistré.</span></div></div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {selectedAccountRows.map(({ position, asset, quote, marketValueInEuros, costInEuros, gainLossInEuros, gainLossPercent }) => (
                          <div key={position.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center", gap: 12, padding: 13, border: "1px solid #26344d", borderRadius: 10, background: "rgba(13,21,37,.55)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                              <div className="account-symbol">{asset?.asset_type === "crypto" ? <Coins size={19} /> : <ChartNoAxesCombined size={19} />}</div>
                              <div className="account-details" style={{ minWidth: 0 }}>
                                <strong>{asset?.name ?? "Actif introuvable"}</strong>
                                <span>{asset?.ticker ? `${asset.ticker} · ` : ""}{asset ? getAssetTypeLabel(asset.asset_type) : "Actif"}</span>
                                <span className="valuation-date">Quantité : {numberFormat(Number(position.quantity))} · Prix moyen : {euro(Number(position.average_cost), position.cost_currency)}</span>
                                <span className="valuation-date">{quote ? `Dernier cours : ${euro(Number(quote.price), quote.currency || asset?.currency || "EUR")} · ${formatDate(quote.quoted_at)}` : "Aucun cours disponible"}</span>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              <strong style={{ color: "#f0f5ff", fontSize: 13 }}>{marketValueInEuros === null ? "— €" : euro(marketValueInEuros)}</strong>
                              <div className="valuation-date">Investi : {costInEuros === null ? "—" : euro(costInEuros)}</div>
                              <div className="valuation-date" style={{ color: gainLossInEuros === null ? "#8995aa" : gainLossInEuros >= 0 ? "#42c99a" : "#ed7b9b" }}>{gainLossInEuros === null ? "Performance indisponible" : `${gainLossInEuros > 0 ? "+" : ""}${euro(gainLossInEuros)}${gainLossPercent === null ? "" : ` (${gainLossPercent.toFixed(2).replace(".", ",")} %)`}`}</div>
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <button className="icon-button" title="Modifier la position" onClick={() => openEditPositionModal(position)}><Pencil size={15} /></button>
                              <button className="icon-button" title="Supprimer la position" onClick={() => deletePosition(position)}><Trash2 size={15} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : accounts.length === 0 ? (
                <div className="account-empty">
                  <Wallet size={22} />
                  <div><strong>Aucun compte ajouté</strong><span>Commence par ajouter ton PEA, tes CTO ou tes livrets.</span></div>
                  <button className="secondary-button" onClick={openCreateModal}><Plus size={15} /> Ajouter un compte</button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 13 }}>
                  {accounts.map((account) => {
                    const summary = accountValuations.find((item) => item.account.id === account.id);
                    const gain = summary?.gainLossInEuros ?? null;
                    return (
                      <div key={account.id} style={{ border: "1px solid #26344d", borderRadius: 12, padding: 16, background: "linear-gradient(145deg, rgba(23,34,55,.92), rgba(13,21,37,.96))", display: "grid", gap: 13 }}>
                        <div role="button" tabIndex={0} onClick={() => openAccountDetails(account)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAccountDetails(account); } }} style={{ cursor: "pointer", display: "grid", gap: 12, outline: "none" }} aria-label={`Ouvrir le détail du compte ${account.name}`}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="account-symbol"><Wallet size={19} /></div>
                            <div style={{ minWidth: 0, flex: 1 }}><strong style={{ display: "block", color: "#e3ebfa", fontSize: 13 }}>{account.name}</strong><span className="muted">{getAccountTypeLabel(account.account_type)}{account.broker ? ` · ${account.broker}` : ""}</span></div>
                            <ChevronDown size={16} style={{ color: "#8190aa", transform: "rotate(-90deg)" }} />
                          </div>
                          <div>
                            <div className="muted">Valeur actuelle</div>
                            <div style={{ fontSize: 22, fontWeight: 650, color: "#f0f5ff", marginTop: 4 }}>{summary?.valueInEuros === null || !summary ? "— €" : euro(summary.valueInEuros)}</div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderTop: "1px solid #26344d", paddingTop: 11 }}>
                            <span className="muted">Plus / moins-value latente</span>
                            <strong style={{ fontSize: 12, color: gain === null ? "#8995aa" : gain >= 0 ? "#42c99a" : "#ed7b9b" }}>{gain === null ? "Non disponible" : `${gain > 0 ? "+" : ""}${euro(gain)}`}</strong>
                          </div>
                          <div className="muted">{summary?.gainLossPercent === null || summary?.gainLossPercent === undefined ? "" : `${summary.gainLossPercent > 0 ? "+" : ""}${summary.gainLossPercent.toFixed(2).replace(".", ",")} % · `}{summary?.positionCount ?? 0} position(s) · {summary?.missingCount ?? 0} sans cours</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #26344d", paddingTop: 9 }}>
                          <button className="text-button" onClick={() => openAccountDetails(account)}>Voir le détail <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} /></button>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {account.account_type === "savings" && <button className="icon-button" title="Valoriser l'épargne" onClick={() => openValuationModal(account)}><Plus size={15} /></button>}
                            <button className="icon-button" title="Modifier le compte" onClick={() => openEditModal(account)}><Pencil size={15} /></button>
                            <button className="icon-button" title="Supprimer le compte" onClick={() => deleteAccount(account)}><Trash2 size={15} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activePage === "performance" && (
            <>
              <section className="welcome-row">
                <div>
                  <p className="eyebrow">ANALYSE DU PORTEFEUILLE</p>
                  <h1>Performance globale</h1>
                  <p className="muted">
                    Suis le capital investi, la valeur de tes positions et tes gains ou pertes latents.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={refreshQuotes}
                  disabled={!user || quotesUpdating}
                >
                  <RefreshCw size={16} className={quotesUpdating ? "spin" : ""} />
                  {quotesUpdating ? "Actualisation…" : "Actualiser les cours"}
                </button>
              </section>

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

              {!user ? (
                <div className="account-empty">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>Connecte-toi pour consulter ta performance</strong>
                    <span>Tes investissements apparaîtront ici après connexion.</span>
                  </div>
                </div>
              ) : accountsLoading || exchangeRatesLoading ? (
                <div className="account-empty">
                  <RefreshCw size={22} />
                  <div>
                    <strong>Calcul de ta performance…</strong>
                    <span>Récupération des cours et conversion des devises.</span>
                  </div>
                </div>
              ) : (
                <>
                  <section className="metrics-grid">
                    <article className="metric-card main-metric">
                      <div className="metric-top">
                        <span>Valeur actuelle des positions cotées</span>
                        <span className="metric-icon"><Wallet size={17} /></span>
                      </div>
                      <div className="metric-value">
                        {performanceSummary.pricedCount > 0 ? euro(performanceSummary.marketValue) : "— €"}
                      </div>
                      <div className="metric-foot muted">
                        {performanceSummary.pricedCount} position(s) valorisée(s) sur {positions.length}
                      </div>
                    </article>

                    <article className="metric-card">
                      <div className="metric-top">
                        <span>Capital d'achat enregistré</span>
                        <span className="metric-icon"><BriefcaseBusiness size={17} /></span>
                      </div>
                      <div className="metric-value">{euro(performanceSummary.investedCapital)}</div>
                      <div className="metric-foot muted">Somme des prix moyens × quantités</div>
                    </article>

                    <article className="metric-card">
                      <div className="metric-top">
                        <span>Gain / perte latent(e)</span>
                        <span className="metric-icon"><TrendingUp size={17} /></span>
                      </div>
                      <div
                        className="metric-value"
                        style={{ color: performanceSummary.gainLoss >= 0 ? "#42c99a" : "#ed7b9b" }}
                      >
                        {performanceSummary.pricedCount > 0
                          ? `${performanceSummary.gainLoss > 0 ? "+" : ""}${euro(performanceSummary.gainLoss)}`
                          : "—"}
                      </div>
                      <div className="metric-foot muted">
                        {performanceSummary.gainLossPercent === null
                          ? "Pourcentage indisponible"
                          : `${performanceSummary.gainLossPercent > 0 ? "+" : ""}${performanceSummary.gainLossPercent.toFixed(2).replace(".", ",")} % sur les positions cotées`}
                      </div>
                    </article>

                    <article className="metric-card">
                      <div className="metric-top">
                        <span>Positions à compléter</span>
                        <span className="metric-icon"><CircleHelp size={17} /></span>
                      </div>
                      <div className="metric-value">{performanceSummary.missingCount}</div>
                      <div className="metric-foot muted">Sans cours ou conversion disponible</div>
                    </article>
                  </section>

                  {exchangeRateError && (
                    <div className="setup-alert error-alert" role="alert">
                      Conversion des devises indisponible : {exchangeRateError}
                    </div>
                  )}

                  <section className="content-grid">
                    <article className="panel chart-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Évolution réelle du portefeuille</h2>
                          <p className="muted">Historique quotidien du CTO, PEA et des cryptomonnaies</p>
                        </div>
                        <span className="period-button">Depuis le début</span>
                      </div>

                      <div className="chart-placeholder">
                        {accountsLoading ? (
                          <div className="empty-chart">
                            <RefreshCw size={27} />
                            <strong>Chargement de l’historique…</strong>
                            <span>Récupération des relevés quotidiens enregistrés.</span>
                          </div>
                        ) : portfolioSnapshotsError ? (
                          <div className="empty-chart">
                            <CircleHelp size={27} />
                            <strong>Historique momentanément indisponible</strong>
                            <span>{portfolioSnapshotsError}</span>
                          </div>
                        ) : investmentHistoryData.length === 0 ? (
                          <div className="empty-chart">
                            <ChartNoAxesCombined size={27} />
                            <strong>En attente du premier relevé</strong>
                            <span>
                              Le graphique commencera à partir du premier relevé quotidien enregistré dans Supabase.
                            </span>
                          </div>
                        ) : (
                          <div style={{ width: "100%", height: 290 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={investmentHistoryData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                                <defs>
                                  <linearGradient id="performanceFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.28} />
                                    <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid stroke="#202a40" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" stroke="#69758e" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} minTickGap={25} />
                                <YAxis
                                  stroke="#69758e"
                                  tick={{ fontSize: 11 }}
                                  tickFormatter={(value) => new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(value) + " €"}
                                  width={65}
                                />
                                <Tooltip
                                  labelFormatter={(label) => `Valorisation réelle du ${formatDate(String(label))}`}
                                  formatter={(value) => [euro(Number(value)), "Portefeuille"]}
                                  contentStyle={{ background: "#151e30", border: "1px solid #29364e", borderRadius: 10, color: "#ffffff" }}
                                  itemStyle={{ color: "#ffffff" }}
                                />
                                <Area type="monotone" dataKey="value" stroke="#A78BFA" strokeWidth={2.5} fill="url(#performanceFill)" dot={investmentHistoryData.length === 1} activeDot={{ r: 5, stroke: "#A78BFA", strokeWidth: 2, fill: "#151e30" }} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                        Historique réel des valorisations quotidiennes du CTO, du PEA et des cryptomonnaies. Les comptes courants, l’épargne et les dettes sont exclus. L’historique débute au premier relevé enregistré ; les changements de positions ne modifient pas les relevés antérieurs.
                      </p>
                      {investmentHistoryData.length === 1 && !portfolioSnapshotsError && (
                        <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                          Premier relevé enregistré : {formatDate(investmentHistoryData[0].date)}. Le graphique prendra forme au fil des prochains relevés quotidiens.
                        </p>
                      )}
                    </article>

                    <article className="panel allocation-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Répartition par enveloppe</h2>
                          <p className="muted">Valeur actuelle des positions cotées</p>
                        </div>
                      </div>
                      {investmentRows.filter((row) => row.marketValueInEuros !== null).length === 0 ? (
                        <div className="allocation-empty">
                          <ChartNoAxesCombined size={24} />
                          <p>La répartition apparaîtra lorsque des cours seront disponibles.</p>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 13, padding: "8px 4px" }}>
                          {accountTypes.map((type) => {
                            const value = investmentRows
                              .filter((row) => row.account?.account_type === type.value && row.marketValueInEuros !== null)
                              .reduce((sum, row) => sum + (row.marketValueInEuros ?? 0), 0);
                            if (value <= 0) return null;
                            const total = performanceSummary.marketValue;
                            const percentage = total > 0 ? (value / total) * 100 : 0;
                            return (
                              <div key={type.value}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                                  <span style={{ color: "#c5cede", fontSize: 13 }}>{type.label}</span>
                                  <strong style={{ color: "#ffffff", fontSize: 13 }}>{euro(value)} · {percentage.toFixed(1).replace(".", ",")} %</strong>
                                </div>
                                <div style={{ height: 7, background: "#202a40", borderRadius: 99, overflow: "hidden" }}>
                                  <div style={{ width: `${percentage}%`, height: "100%", background: allocationColors[type.value], borderRadius: 99 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  </section>

                  <section className="panel bottom-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Détail de la performance par position</h2>
                        <p className="muted">Comparaison entre le prix moyen d'achat et le dernier cours disponible</p>
                      </div>
                    </div>
                    {positions.length === 0 ? (
                      <div className="account-empty">
                        <BriefcaseBusiness size={22} />
                        <div><strong>Aucun investissement enregistré</strong><span>Ajoute tes premières positions dans « Mes investissements ».</span></div>
                      </div>
                    ) : (
                      <div className="account-list">
                        {investmentRows.map(({ position, asset, account, quote, costInEuros, marketValueInEuros, gainLossInEuros, gainLossPercent }) => (
                          <div className="account-row" key={position.id}>
                            <div className="account-symbol">
                              {asset?.asset_type === "crypto" ? <Coins size={19} /> : <ChartNoAxesCombined size={19} />}
                            </div>
                            <div className="account-details">
                              <strong>{asset?.name ?? "Actif introuvable"}</strong>
                              <span>{asset?.ticker ? `${asset.ticker} · ` : ""}{asset ? getAssetTypeLabel(asset.asset_type) : "Actif"}{account ? ` · ${account.name}` : ""}</span>
                              <span className="valuation-date">Quantité : {numberFormat(Number(position.quantity))} · Prix moyen : {euro(Number(position.average_cost), position.cost_currency)}</span>
                              <span className="valuation-date">{quote ? `Dernier cours : ${euro(Number(quote.price), quote.currency || asset?.currency || "EUR")} · ${formatDate(quote.quoted_at)}` : "Aucun cours disponible"}</span>
                            </div>
                            <div className="account-valuation">
                              <strong>{marketValueInEuros === null ? "— €" : euro(marketValueInEuros)}</strong>
                              <span className="valuation-date">Investi : {costInEuros === null ? "—" : euro(costInEuros)}</span>
                              <span className="valuation-date" style={{ color: gainLossInEuros === null ? undefined : gainLossInEuros >= 0 ? "#42c99a" : "#ed7b9b" }}>
                                {gainLossInEuros === null ? "Performance indisponible" : `${gainLossInEuros > 0 ? "+" : ""}${euro(gainLossInEuros)}${gainLossPercent === null ? "" : ` (${gainLossPercent.toFixed(2).replace(".", ",")} %)`}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <div className="valuation-info">
                    <CircleHelp size={17} />
                    <span>
                      La performance affichée est une plus-value ou moins-value latente estimée à partir des quantités et prix moyens que tu as saisis. Elle n'inclut pas les frais, dividendes, versements ou retraits. Les positions sans cours disponible sont signalées et exclues du calcul de performance.
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {activePage === "debts" && (
            <>
              <section className="welcome-row">
                <div>
                  <p className="eyebrow">SUIVI FINANCIER</p>
                  <h1>Mes dettes</h1>
                  <p className="muted">Suis tes crédits et le capital qu'il te reste à rembourser.</p>
                </div>
                <button className="primary-button" onClick={openCreateDebtModal} disabled={!user}>
                  <Plus size={17} /> Ajouter une dette
                </button>
              </section>

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
                    <span>Capital restant dû</span>
                    <span className="metric-icon"><ArrowDownRight size={17} /></span>
                  </div>
                  <div className="metric-value">{euro(totalDebtRemaining)}</div>
                  <div className="metric-foot muted">Total indicatif de tes dettes enregistrées</div>
                </article>
                <article className="metric-card">
                  <div className="metric-top"><span>Dettes suivies</span><span className="metric-icon"><Wallet size={17} /></span></div>
                  <div className="metric-value">{debts.length}</div>
                  <div className="metric-foot muted">Crédits et autres engagements</div>
                </article>
                <article className="metric-card">
                  <div className="metric-top"><span>Mensualités cumulées</span><span className="metric-icon"><CalendarDays size={17} /></span></div>
                  <div className="metric-value">{euro(debts.reduce((sum, debt) => sum + Number(debt.monthly_payment || 0), 0))}</div>
                  <div className="metric-foot muted">Somme des mensualités renseignées</div>
                </article>
              </section>

              <section className="panel bottom-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Mes crédits et engagements</h2>
                    <p className="muted">Ces montants restent séparés de tes comptes et de la performance de tes investissements.</p>
                  </div>
                  {debts.length > 0 && (
                    <button className="text-button" onClick={openCreateDebtModal} disabled={!user}>
                      <Plus size={15} /> Ajouter une dette
                    </button>
                  )}
                </div>

                {!user ? (
                  <div className="account-empty">
                    <ShieldCheck size={22} />
                    <div><strong>Connecte-toi pour gérer tes dettes</strong><span>Tes données personnelles apparaîtront ici.</span></div>
                  </div>
                ) : accountsLoading ? (
                  <div className="account-empty"><RefreshCw size={22} /><div><strong>Chargement des dettes…</strong><span>Récupération de tes données depuis Supabase.</span></div></div>
                ) : debts.length === 0 ? (
                  <div className="account-empty">
                    <ArrowDownRight size={22} />
                    <div><strong>Aucune dette enregistrée</strong><span>Ajoute un crédit ou un engagement pour suivre son capital restant dû.</span></div>
                    <button className="secondary-button" onClick={openCreateDebtModal}><Plus size={15} /> Ajouter une dette</button>
                  </div>
                ) : (
                  <div className="account-list">
                    {debts.map((debt) => (
                      <div className="account-row" key={debt.id}>
                        <div className="account-symbol"><ArrowDownRight size={19} /></div>
                        <div className="account-details">
                          <strong>{debt.name}</strong>
                          <span>{getDebtTypeLabel(debt.debt_type)} · Montant initial : {euro(Number(debt.initial_amount))}</span>
                          <span className="valuation-date">
                            {debt.monthly_payment !== null ? `Mensualité : ${euro(Number(debt.monthly_payment))}` : "Mensualité non renseignée"}
                            {debt.interest_rate !== null ? ` · Taux : ${numberFormat(Number(debt.interest_rate), 3)} %` : ""}
                            {debt.due_date ? ` · Échéance : ${formatDate(debt.due_date)}` : ""}
                          </span>
                          {debt.notes && <span className="valuation-date">{debt.notes}</span>}
                        </div>
                        <div className="account-valuation"><strong>{euro(Number(debt.remaining_amount))}</strong><span className="valuation-date">Restant dû</span></div>
                        <div className="account-actions">
                          <button className="icon-button" aria-label="Modifier la dette" title="Modifier" onClick={() => openEditDebtModal(debt)}><Pencil size={16} /></button>
                          <button className="icon-button" aria-label="Supprimer la dette" title="Supprimer" onClick={() => deleteDebt(debt)}><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <div className="valuation-info">
                <ShieldCheck size={17} />
                <span>Le suivi des dettes est purement informatif : il ne modifie ni la valorisation de tes comptes, ni tes investissements, ni les calculs de performance globale.</span>
              </div>
            </>
          )}

          {activePage === "investments" && (
            <>
              <section className="welcome-row">
                <div>
                  <p className="eyebrow">PORTEFEUILLE</p>
                  <h1>Mes investissements</h1>
                  <p className="muted">
                    Suis tes actifs, tes quantités et tes prix moyens d'achat.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="secondary-button"
                    onClick={openCreateAssetModal}
                    disabled={!user}
                  >
                    <Plus size={16} /> Ajouter un actif
                  </button>
                  <button
                    className="primary-button"
                    onClick={openCreatePositionModal}
                    disabled={!user || accounts.length === 0 || assets.length === 0}
                  >
                    <Plus size={16} /> Ajouter une position
                  </button>
                </div>
              </section>

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
                    <span>Positions détenues</span>
                    <span className="metric-icon"><BriefcaseBusiness size={17} /></span>
                  </div>
                  <div className="metric-value">{totalPositions}</div>
                  <div className="metric-foot muted">
                    Positions enregistrées dans tes comptes
                  </div>
                </article>

                <article
                  className="metric-card"
                  role="button"
                  tabIndex={0}
                  aria-label="Afficher la liste de mes actifs référencés"
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    document.getElementById("assets-library")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      document.getElementById("assets-library")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }
                  }}
                >
                  <div className="metric-top">
                    <span>Actifs référencés</span>
                    <span className="metric-icon"><Package size={17} /></span>
                  </div>
                  <div className="metric-value">{assets.length}</div>
                  <div className="metric-foot muted">
                    Voir la liste et modifier les actifs
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>Comptes utilisés</span>
                    <span className="metric-icon"><Wallet size={17} /></span>
                  </div>
                  <div className="metric-value">
                    {new Set(positions.map((position) => position.account_id)).size}
                  </div>
                  <div className="metric-foot muted">
                    Comptes contenant une position
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>Valeur actuelle</span>
                    <span className="metric-icon"><TrendingUp size={17} /></span>
                  </div>
                  <div className="metric-value" style={{ fontSize: 18 }}>
                    {investmentTotals.pricedCount > 0 ? euro(investmentTotals.marketValue) : "— €"}
                  </div>
                  <div className="metric-foot muted">
                    {investmentTotals.pricedCount} position(s) avec un cours disponible
                  </div>
                </article>
              </section>

              <div className="valuation-info">
                <TrendingUp size={17} />
                <span>
                  Performance des positions valorisées :{" "}
                  <strong style={{ color: investmentTotals.gainLoss >= 0 ? "#42c99a" : "#ed7b9b" }}>
                    {investmentTotals.pricedCount > 0
                      ? `${investmentTotals.gainLoss > 0 ? "+" : ""}${euro(investmentTotals.gainLoss)}${investmentTotals.gainLossPercent === null ? "" : ` (${investmentTotals.gainLossPercent.toFixed(2).replace(".", ",")} %)`}`
                      : "En attente de cours disponibles"}
                  </strong>
                  {investmentTotals.missingCount > 0
                    ? ` · ${investmentTotals.missingCount} position(s) non valorisée(s)`
                    : ""}
                </span>
              </div>

              <section className="panel bottom-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Mes positions</h2>
                    <p className="muted">
                      Détail des actifs détenus dans chacun de tes comptes
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={openCreatePositionModal}
                    disabled={!user || accounts.length === 0 || assets.length === 0}
                  >
                    <Plus size={15} /> Ajouter une position
                  </button>
                </div>

                {!user ? (
                  <div className="account-empty">
                    <BriefcaseBusiness size={22} />
                    <div>
                      <strong>Connecte-toi pour afficher tes investissements</strong>
                      <span>Tes positions personnelles apparaîtront ici.</span>
                    </div>
                  </div>
                ) : accountsLoading ? (
                  <div className="account-empty">
                    <RefreshCw size={22} />
                    <div>
                      <strong>Chargement des investissements…</strong>
                      <span>Récupération des actifs et des positions.</span>
                    </div>
                  </div>
                ) : positions.length === 0 ? (
                  <div className="account-empty">
                    <ChartNoAxesCombined size={22} />
                    <div>
                      <strong>Aucune position enregistrée</strong>
                      <span>
                        Commence par ajouter un actif, puis associe-le à un compte.
                      </span>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={openCreateAssetModal}
                    >
                      <Plus size={15} /> Ajouter un actif
                    </button>
                  </div>
                ) : (
                  <div className="account-list">
                    {investmentRows.map(({ position, asset, account, quote, marketValueInEuros, gainLossInEuros, gainLossPercent }) => {
                      const invested =
                        Number(position.quantity) * Number(position.average_cost);

                      return (
                        <div className="account-row" key={position.id}>
                          <div className="account-symbol">
                            {asset?.asset_type === "crypto"
                              ? <Coins size={19} />
                              : <ChartNoAxesCombined size={19} />}
                          </div>

                          <div className="account-details">
                            <strong>{asset?.name ?? "Actif introuvable"}</strong>
                            <span>
                              {asset?.ticker ? `${asset.ticker} · ` : ""}
                              {asset ? getAssetTypeLabel(asset.asset_type) : "Actif"}
                              {account ? ` · ${account.name}` : ""}
                            </span>
                            <span className="valuation-date">
                              Quantité : {numberFormat(Number(position.quantity))}
                              {" · "}
                              Prix moyen : {euro(Number(position.average_cost), position.cost_currency)}
                            </span>
                            <span className="valuation-date">
                              {quote
                                ? `Dernier cours : ${euro(Number(quote.price), quote.currency || asset?.currency || "EUR")} · ${formatDate(quote.quoted_at)}`
                                : "Aucun cours disponible"}
                            </span>
                          </div>

                          <div className="account-valuation">
                            <strong>{marketValueInEuros === null ? "— €" : euro(marketValueInEuros)}</strong>
                            <span className="valuation-date">Valeur actuelle</span>
                            <span className="valuation-date">Coût : {euro(invested, position.cost_currency)}</span>
                            <span className="valuation-date" style={{ color: gainLossInEuros === null ? undefined : gainLossInEuros >= 0 ? "#42c99a" : "#ed7b9b" }}>
                              {gainLossInEuros === null
                                ? "Performance indisponible"
                                : `${gainLossInEuros > 0 ? "+" : ""}${euro(gainLossInEuros)}${gainLossPercent === null ? "" : ` (${gainLossPercent > 0 ? "+" : ""}${gainLossPercent.toFixed(2).replace(".", ",")} %)`}`}
                            </span>
                          </div>

                          <div className="account-actions">
                            <button
                              className="icon-button"
                              aria-label="Modifier la position"
                              title="Modifier"
                              onClick={() => openEditPositionModal(position)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label="Supprimer la position"
                              title="Supprimer"
                              onClick={() => deletePosition(position)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section id="assets-library" className="panel bottom-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Mes actifs référencés</h2>
                    <p className="muted">
                      Bibliothèque des actifs que tu peux associer à tes comptes
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      className="text-button"
                      onClick={refreshQuotes}
                      disabled={quotesUpdating || !assets.some((asset) => {
                        const settings = asset as Asset & { is_manual_quote?: boolean };
                        return settings.is_manual_quote === false;
                      })}
                      title="Récupérer les derniers cours des actifs configurés en automatique"
                    >
                      <RefreshCw size={15} className={quotesUpdating ? "spin" : ""} />
                      {quotesUpdating ? "Actualisation…" : "Actualiser les cours"}
                    </button>
                    <button className="text-button" onClick={openCreateAssetModal}>
                      <Plus size={15} /> Ajouter un actif
                    </button>
                  </div>
                </div>

                {assets.length === 0 ? (
                  <div className="account-empty">
                    <Package size={22} />
                    <div>
                      <strong>Aucun actif référencé</strong>
                      <span>Ajoute ton premier ETF, action ou autre actif.</span>
                    </div>
                  </div>
                ) : (
                  <div className="account-list">
                    {assets.map((asset) => (
                      <div className="account-row" key={asset.id}>
                        <div className="account-symbol">
                          {asset.asset_type === "crypto"
                            ? <Coins size={19} />
                            : <Package size={19} />}
                        </div>
                        <div className="account-details">
                          <strong>{asset.name}</strong>
                          <span>
                            {getAssetTypeLabel(asset.asset_type)}
                            {asset.ticker ? ` · ${asset.ticker}` : ""}
                            {asset.isin ? ` · ${asset.isin}` : ""}
                          </span>
                          <span className="valuation-date">
                            Devise : {asset.currency}
                            {asset.exchange ? ` · Marché : ${asset.exchange}` : ""}
                          </span>
                        </div>
                        <div className="account-actions">
                          <button
                            className="icon-button"
                            aria-label="Modifier l'actif"
                            title="Modifier"
                            onClick={() => openEditAssetModal(asset)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="valuation-info">
                <CircleHelp size={17} />
                <span>
                  Les valeurs actuelles sont calculées à partir du dernier cours enregistré et converties en euros. Les actions et ETF peuvent utiliser une clôture quotidienne ; les cryptomonnaies peuvent être actualisées plus fréquemment. Une position sans cours ou taux de change disponible n'est pas incluse dans les totaux.
                </span>
              </div>
            </>
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

      {/* Fenêtre de création / modification d'un compte */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => !saving && setModalOpen(false)}>
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
                onClick={() => !saving && setModalOpen(false)}
                disabled={saving}
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
                <button type="submit" className="primary-button" disabled={saving}>
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

      {/* Fenêtre de valorisation d'un compte */}
      {valuationModalAccount && (
        <div
          className="modal-overlay"
          onClick={() => !saving && setValuationModalAccount(null)}
        >
          <div
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="valuation-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">VALORISATION DU COMPTE</p>
                <h2 id="valuation-modal-title">{valuationModalAccount.name}</h2>
                <p className="muted">
                  Enregistrer une nouvelle valeur sans effacer les précédentes.
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Fermer"
                onClick={() => !saving && setValuationModalAccount(null)}
                disabled={saving}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveValuation}>
              <label className="form-field">
                <span>Montant de la valorisation *</span>
                <div className="amount-input-wrapper">
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    placeholder="Ex. 2500"
                    value={valuationForm.amount}
                    onChange={(event) =>
                      setValuationForm({
                        ...valuationForm,
                        amount: event.target.value,
                      })
                    }
                  />
                  <span>{valuationModalAccount.currency}</span>
                </div>
              </label>

              <label className="form-field">
                <span>Date de valorisation *</span>
                <input
                  type="date"
                  required
                  value={valuationForm.valuation_date}
                  onChange={(event) =>
                    setValuationForm({
                      ...valuationForm,
                      valuation_date: event.target.value,
                    })
                  }
                />
              </label>

              <label className="form-field">
                <span>Note (facultatif)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="Ex. Valorisation mensuelle..."
                  value={valuationForm.note}
                  onChange={(event) =>
                    setValuationForm({
                      ...valuationForm,
                      note: event.target.value,
                    })
                  }
                />
              </label>

              <div className="valuation-info">
                <CalendarDays size={17} />
                <span>
                  Cette valorisation de ton épargne sera ajoutée à l'historique.
                  Les valorisations précédentes seront conservées.
                </span>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setValuationModalAccount(null)}
                  disabled={saving}
                >
                  Annuler
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer la valorisation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fenêtre de création / modification d'un actif */}
      {assetModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => !saving && setAssetModalOpen(false)}
        >
          <div
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">BIBLIOTHÈQUE D'ACTIFS</p>
                <h2 id="asset-modal-title">
                  {editingAsset ? "Modifier l'actif" : "Ajouter un actif"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Fermer"
                onClick={() => !saving && setAssetModalOpen(false)}
                disabled={saving}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveAsset}>
              <label className="form-field">
                <span>Nom de l'actif *</span>
                <input
                  autoFocus
                  required
                  maxLength={150}
                  placeholder="Ex. Vanguard FTSE All-World"
                  value={assetForm.name}
                  onChange={(event) =>
                    setAssetForm({ ...assetForm, name: event.target.value })
                  }
                />
              </label>

              <label className="form-field">
                <span>Type d'actif *</span>
                <select
                  value={assetForm.asset_type}
                  onChange={(event) => {
                    const nextAssetType = event.target.value as AssetType;
                    setAssetForm({
                      ...assetForm,
                      asset_type: nextAssetType,
                      quote_provider: nextAssetType === "crypto" ? "coingecko" : "fmp",
                    });
                  }}
                >
                  {assetTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Symbole / Ticker</span>
                <input
                  maxLength={30}
                  placeholder="Ex. VWCE, CW8, BTC..."
                  value={assetForm.ticker}
                  onChange={(event) =>
                    setAssetForm({ ...assetForm, ticker: event.target.value })
                  }
                />
              </label>

              <label className="form-field">
                <span>Code ISIN</span>
                <input
                  maxLength={12}
                  placeholder="Ex. IE00BK5BQT80"
                  value={assetForm.isin}
                  onChange={(event) =>
                    setAssetForm({ ...assetForm, isin: event.target.value })
                  }
                />
              </label>

              <label className="form-field">
                <span>Marché / Bourse</span>
                <input
                  maxLength={80}
                  placeholder="Ex. Euronext Paris, Xetra..."
                  value={assetForm.exchange}
                  onChange={(event) =>
                    setAssetForm({ ...assetForm, exchange: event.target.value })
                  }
                />
              </label>

              <label className="form-field">
                <span>Devise de cotation</span>
                <select
                  value={assetForm.currency}
                  onChange={(event) =>
                    setAssetForm({ ...assetForm, currency: event.target.value })
                  }
                >
                  <option value="EUR">Euro (EUR)</option>
                  <option value="USD">Dollar américain (USD)</option>
                  <option value="GBP">Livre sterling (GBP)</option>
                  <option value="CHF">Franc suisse (CHF)</option>
                </select>
              </label>

              <label className="form-field">
                <span>Mode de cotation</span>
                <select
                  value={assetForm.quote_mode}
                  onChange={(event) =>
                    setAssetForm({
                      ...assetForm,
                      quote_mode: event.target.value as "manual" | "automatic",
                      quote_provider:
                        assetForm.asset_type === "crypto" ? "coingecko" : "fmp",
                    })
                  }
                >
                  <option value="manual">Manuelle</option>
                  <option value="automatic">Automatique</option>
                </select>
              </label>

              {assetForm.quote_mode === "automatic" && (
                <>
                  <label className="form-field">
                    <span>Fournisseur de cotation</span>
                    <select
                      value={assetForm.quote_provider}
                      onChange={(event) =>
                        setAssetForm({
                          ...assetForm,
                          quote_provider: event.target.value as "fmp" | "coingecko",
                        })
                      }
                    >
                      {assetForm.asset_type === "crypto" ? (
                        <option value="coingecko">CoinGecko</option>
                      ) : (
                        <option value="fmp">Financial Modeling Prep (FMP)</option>
                      )}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>Symbole fournisseur *</span>
                    <input
                      required
                      maxLength={80}
                      placeholder={
                        assetForm.quote_provider === "coingecko"
                          ? "Ex. bitcoin"
                          : "Ex. VWCE.DE ou JEQP.DE"
                      }
                      value={assetForm.quote_symbol}
                      onChange={(event) =>
                        setAssetForm({ ...assetForm, quote_symbol: event.target.value })
                      }
                    />
                  </label>

                  <div className="valuation-info">
                    <CircleHelp size={17} />
                    <span>
                      Pour CoinGecko, utilise l'identifiant de la cryptomonnaie (par exemple
                      « bitcoin »). Pour FMP, utilise le symbole exact reconnu par FMP
                      (par exemple « JEQP.DE » si ce symbole est bien disponible).
                      La cotation automatique sera actualisée par la fonction Supabase.
                    </span>
                  </div>
                </>
              )}

              <div className="valuation-info">
                <CircleHelp size={17} />
                <span>
                  L'actif sera enregistré dans ta bibliothèque. Tu pourras
                  ensuite le rattacher à un ou plusieurs comptes.
                </span>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAssetModalOpen(false)}
                  disabled={saving}
                >
                  Annuler
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving
                    ? "Enregistrement…"
                    : editingAsset
                      ? "Enregistrer les modifications"
                      : "Ajouter l'actif"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fenêtre de création / modification d'une position */}
      {positionModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => !saving && setPositionModalOpen(false)}
        >
          <div
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="position-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">PORTEFEUILLE</p>
                <h2 id="position-modal-title">
                  {editingPosition ? "Modifier la position" : "Ajouter une position"}
                </h2>
                <p className="muted">
                  Renseigne la quantité détenue et ton prix moyen d'achat.
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Fermer"
                onClick={() => !saving && setPositionModalOpen(false)}
                disabled={saving}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={savePosition}>
              <label className="form-field">
                <span>Compte de détention *</span>
                <select
                  required
                  value={positionForm.account_id}
                  onChange={(event) =>
                    setPositionForm({
                      ...positionForm,
                      account_id: event.target.value,
                    })
                  }
                  disabled={Boolean(editingPosition)}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} — {getAccountTypeLabel(account.account_type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Actif *</span>
                <select
                  required
                  value={positionForm.asset_id}
                  onChange={(event) => {
                    const selectedAsset = assets.find(
                      (item) => item.id === event.target.value
                    );
                    setPositionForm({
                      ...positionForm,
                      asset_id: event.target.value,
                      cost_currency: selectedAsset?.currency ?? "EUR",
                    });
                  }}
                  disabled={Boolean(editingPosition)}
                >
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}{asset.ticker ? ` (${asset.ticker})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Quantité détenue *</span>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  placeholder="Ex. 12.5"
                  value={positionForm.quantity}
                  onChange={(event) =>
                    setPositionForm({
                      ...positionForm,
                      quantity: event.target.value,
                    })
                  }
                />
              </label>

              <label className="form-field">
                <span>Prix moyen d'achat par unité *</span>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  placeholder="Ex. 105.50"
                  value={positionForm.average_cost}
                  onChange={(event) =>
                    setPositionForm({
                      ...positionForm,
                      average_cost: event.target.value,
                    })
                  }
                />
              </label>

              <label className="form-field">
                <span>Devise du prix d'achat *</span>
                <select
                  value={positionForm.cost_currency}
                  onChange={(event) =>
                    setPositionForm({
                      ...positionForm,
                      cost_currency: event.target.value,
                    })
                  }
                >
                  <option value="EUR">Euro (EUR)</option>
                  <option value="USD">Dollar américain (USD)</option>
                  <option value="GBP">Livre sterling (GBP)</option>
                  <option value="CHF">Franc suisse (CHF)</option>
                </select>
              </label>

              <label className="form-field">
                <span>Date d'ouverture (facultatif)</span>
                <input
                  type="date"
                  value={positionForm.opened_at}
                  onChange={(event) =>
                    setPositionForm({
                      ...positionForm,
                      opened_at: event.target.value,
                    })
                  }
                />
              </label>

              <label className="form-field">
                <span>Notes (facultatif)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="Informations complémentaires..."
                  value={positionForm.notes}
                  onChange={(event) =>
                    setPositionForm({
                      ...positionForm,
                      notes: event.target.value,
                    })
                  }
                />
              </label>

              {positionForm.quantity && positionForm.average_cost && (
                <div className="valuation-info">
                  <TrendingUp size={17} />
                  <span>
                    Coût d'acquisition estimé :{" "}
                    <strong>
                      {euro(
                        Number(positionForm.quantity) *
                          Number(positionForm.average_cost),
                        positionForm.cost_currency
                      )}
                    </strong>
                  </span>
                </div>
              )}

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPositionModalOpen(false)}
                  disabled={saving}
                >
                  Annuler
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving
                    ? "Enregistrement…"
                    : editingPosition
                      ? "Enregistrer les modifications"
                      : "Ajouter la position"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {debtModalOpen && (
        <div className="modal-overlay" onClick={() => !saving && setDebtModalOpen(false)}>
          <div className="account-modal" role="dialog" aria-modal="true" aria-labelledby="debt-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">MES DETTES</p>
                <h2 id="debt-modal-title">{editingDebt ? "Modifier la dette" : "Ajouter une dette"}</h2>
                <p className="muted">Renseigne le capital initial et le montant qu'il te reste à rembourser.</p>
              </div>
              <button className="icon-button" aria-label="Fermer" onClick={() => !saving && setDebtModalOpen(false)} disabled={saving}><X size={19} /></button>
            </div>

            <form onSubmit={saveDebt}>
              <label className="form-field">
                <span>Nom de la dette *</span>
                <input autoFocus required maxLength={120} placeholder="Ex. Crédit immobilier résidence principale" value={debtForm.name} onChange={(event) => setDebtForm({ ...debtForm, name: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Type de dette *</span>
                <select value={debtForm.debt_type} onChange={(event) => setDebtForm({ ...debtForm, debt_type: event.target.value })}>
                  {debtTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Montant initial (€) *</span>
                <input type="number" required min="0.01" step="0.01" placeholder="Ex. 150000" value={debtForm.initial_amount} onChange={(event) => setDebtForm({ ...debtForm, initial_amount: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Capital restant dû (€) *</span>
                <input type="number" required min="0" step="0.01" placeholder="Ex. 128500" value={debtForm.remaining_amount} onChange={(event) => setDebtForm({ ...debtForm, remaining_amount: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Mensualité (€) (facultatif)</span>
                <input type="number" min="0" step="0.01" placeholder="Ex. 750" value={debtForm.monthly_payment} onChange={(event) => setDebtForm({ ...debtForm, monthly_payment: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Taux d'intérêt (%) (facultatif)</span>
                <input type="number" min="0" max="100" step="0.001" placeholder="Ex. 3,25" value={debtForm.interest_rate} onChange={(event) => setDebtForm({ ...debtForm, interest_rate: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Date de fin prévue (facultatif)</span>
                <input type="date" value={debtForm.due_date} onChange={(event) => setDebtForm({ ...debtForm, due_date: event.target.value })} />
              </label>
              <label className="form-field">
                <span>Notes (facultatif)</span>
                <textarea rows={3} maxLength={1000} placeholder="Informations complémentaires…" value={debtForm.notes} onChange={(event) => setDebtForm({ ...debtForm, notes: event.target.value })} />
              </label>
              <div className="valuation-info"><ShieldCheck size={17} /><span>Ces informations sont enregistrées séparément de tes comptes et de tes investissements.</span></div>
              {error && <div className="form-error">{error}</div>}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setDebtModalOpen(false)} disabled={saving}>Annuler</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : editingDebt ? "Enregistrer les modifications" : "Ajouter la dette"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

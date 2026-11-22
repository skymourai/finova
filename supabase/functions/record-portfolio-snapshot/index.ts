
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getParisDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Méthode non autorisée." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("CRON_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
      throw new Error("Configuration Supabase incomplète.");
    }

    if (req.headers.get("x-cron-secret") !== cronSecret) {
      return new Response(
        JSON.stringify({ error: "Accès non autorisé." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const snapshotDate = getParisDate();

    // Comptes concernés uniquement : PEA, CTO et Crypto.
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, user_id")
      .in("account_type", ["pea", "cto", "crypto"]);

    if (accountsError) throw accountsError;

    const userIds = [
      ...new Set((accounts ?? []).map((account) => account.user_id)),
    ];

    const results = [];

    for (const userId of userIds) {
      try {
        const accountIds = (accounts ?? [])
          .filter((account) => account.user_id === userId)
          .map((account) => account.id);

        const { data: positions, error: positionsError } = await supabase
          .from("positions")
          .select("asset_id, account_id, quantity")
          .eq("user_id", userId)
          .in("account_id", accountIds);

        if (positionsError) throw positionsError;

        if (!positions || positions.length === 0) {
          results.push({ status: "skipped", reason: "Aucune position" });
          continue;
        }

        const assetIds = [
          ...new Set(positions.map((position) => position.asset_id)),
        ];

        const { data: assets, error: assetsError } = await supabase
          .from("assets")
          .select("id, name, currency")
          .eq("user_id", userId)
          .in("id", assetIds);

        if (assetsError) throw assetsError;

        const { data: quotes, error: quotesError } = await supabase
          .from("quotes")
          .select("asset_id, price, currency, price_eur, quoted_at")
          .eq("user_id", userId)
          .in("asset_id", assetIds)
          .order("quoted_at", { ascending: false });

        if (quotesError) throw quotesError;

        // Conserver le dernier cours disponible pour chaque actif.
        const latestQuotes = new Map<string, typeof quotes[number]>();

        for (const quote of quotes ?? []) {
          if (!latestQuotes.has(quote.asset_id)) {
            latestQuotes.set(quote.asset_id, quote);
          }
        }

        const assetById = new Map(
          (assets ?? []).map((asset) => [asset.id, asset]),
        );

        // Vérifier que toutes les positions ont un cours exploitable.
        const missingAssets = positions.filter(
          (position) => !latestQuotes.has(position.asset_id),
        );

        if (missingAssets.length > 0) {
          results.push({
            status: "skipped",
            reason: `${missingAssets.length} position(s) sans cours`,
          });
          continue;
        }

        // Récupérer les devises qui nécessitent une conversion.
        const currencies = [
          ...new Set(
            positions.map((position) => {
              const quote = latestQuotes.get(position.asset_id)!;
              const asset = assetById.get(position.asset_id);
              return (quote.currency || asset?.currency || "EUR").toUpperCase();
            }),
          ),
        ].filter((currency) => currency !== "EUR");

        const exchangeRates: Record<string, number> = { EUR: 1 };

        if (currencies.length > 0) {
          const params = new URLSearchParams({
            base: "EUR",
            quotes: currencies.join(","),
          });

          const response = await fetch(
            `https://api.frankfurter.dev/v2/rates?${params.toString()}`,
          );

          if (!response.ok) {
            throw new Error("Impossible de récupérer les taux de change.");
          }

          const rates = await response.json();

          for (const item of rates) {
            exchangeRates[item.quote] = Number(item.rate);
          }

          const missingRates = currencies.filter(
            (currency) => !exchangeRates[currency] || exchangeRates[currency] <= 0,
          );

          if (missingRates.length > 0) {
            results.push({
              status: "skipped",
              reason: `Taux de change indisponible : ${missingRates.join(", ")}`,
            });
            continue;
          }
        }

        // Calculer la valeur totale en euros.
        let totalValue = 0;
        let calculationError = false;

        for (const position of positions) {
          const quote = latestQuotes.get(position.asset_id)!;
          const asset = assetById.get(position.asset_id);

          const quantity = Number(position.quantity);
          const price = validNumber(quote.price);
          const priceEur = validNumber(quote.price_eur);
          const currency = (
            quote.currency || asset?.currency || "EUR"
          ).toUpperCase();

          if (!Number.isFinite(quantity) || quantity < 0 || (!price && !priceEur)) {
            calculationError = true;
            break;
          }

          let unitPriceEur: number;

          if (priceEur !== null) {
            unitPriceEur = priceEur;
          } else if (currency === "EUR" && price !== null) {
            unitPriceEur = price;
          } else {
            const rate = exchangeRates[currency];

            if (!rate || rate <= 0 || price === null) {
              calculationError = true;
              break;
            }

            // Frankfurter donne le nombre d'unités étrangères pour 1 EUR.
            unitPriceEur = price / rate;
          }

          totalValue += quantity * unitPriceEur;
        }

        if (calculationError || !Number.isFinite(totalValue)) {
          results.push({
            status: "skipped",
            reason: "Valorisation incomplète ou invalide",
          });
          continue;
        }

        const { error: saveError } = await supabase
          .from("portfolio_daily_snapshots")
          .upsert(
            {
              user_id: userId,
              snapshot_date: snapshotDate,
              total_value_eur: totalValue,
              positions_count: positions.length,
            },
            { onConflict: "user_id,snapshot_date" },
          );

        if (saveError) throw saveError;

        results.push({
          status: "saved",
          positions_count: positions.length,
          total_value_eur: Number(totalValue.toFixed(2)),
        });
      } catch (error) {
        console.error("Erreur pour un portefeuille :", error);
        results.push({
          status: "error",
          reason: error instanceof Error ? error.message : "Erreur inconnue",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        snapshot_date: snapshotDate,
        users_processed: userIds.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Erreur générale :", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erreur inconnue",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

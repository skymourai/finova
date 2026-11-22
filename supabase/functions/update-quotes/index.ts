
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Asset = {
  id: string;
  user_id: string;
  name: string;
  asset_type: string;
  currency: string;
  quote_provider: string | null;
  quote_symbol: string | null;
  is_manual_quote: boolean;
};

type QuoteData = {
  user_id: string;
  asset_id: string;
  price: number;
  currency: string;
  price_eur: number | null;
  provider: string;
  quoted_at: string;
  fetched_at: string;
};

type UserResult = {
  user_id: string;
  updated: number;
  errors: string[];
  warnings: string[];
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function isCrypto(asset: Asset): boolean {
  return (
    asset.asset_type?.toLowerCase().includes("crypto") === true ||
    asset.quote_provider?.toLowerCase().includes("coingecko") === true
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function saveQuote(
  supabase: SupabaseClient,
  asset: Asset,
  price: number,
  currency: string,
  provider: string,
  quotedAt: string,
  result: UserResult,
) {
  if (!Number.isFinite(price) || price <= 0) {
    result.errors.push(`${asset.name}: cours invalide.`);
    return;
  }

  const normalizedCurrency = currency.toUpperCase();
  const assetCurrency = asset.currency?.toUpperCase();

  if (assetCurrency && assetCurrency !== normalizedCurrency) {
    result.warnings.push(
      `${asset.name}: devise de l'actif (${assetCurrency}) différente de celle du cours (${normalizedCurrency}).`,
    );
  }

  const fetchedAt = new Date().toISOString();

  const quote: QuoteData = {
    user_id: asset.user_id,
    asset_id: asset.id,
    price,
    currency: normalizedCurrency,
    price_eur: normalizedCurrency === "EUR" ? price : null,
    provider,
    quoted_at: quotedAt,
    fetched_at: fetchedAt,
  };

  const { error: quoteError } = await supabase
    .from("quotes")
    .upsert(quote, {
      onConflict: "user_id,asset_id",
    });

  if (quoteError) {
    result.errors.push(
      `${asset.name}: erreur enregistrement du cours (${quoteError.message}).`,
    );
    return;
  }

  // Une seule valeur historique par actif et par journée UTC.
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: existingHistory, error: historyCheckError } = await supabase
    .from("price_history")
    .select("id")
    .eq("user_id", asset.user_id)
    .eq("asset_id", asset.id)
    .gte("recorded_at", dayStart.toISOString())
    .lt("recorded_at", dayEnd.toISOString())
    .limit(1);

  if (historyCheckError) {
    result.warnings.push(
      `${asset.name}: cours actualisé, mais vérification de l'historique impossible (${historyCheckError.message}).`,
    );
  } else if (!existingHistory || existingHistory.length === 0) {
    const { error: historyError } = await supabase
      .from("price_history")
      .insert({
        ...quote,
        recorded_at: fetchedAt,
      });

    if (historyError) {
      result.warnings.push(
        `${asset.name}: cours actualisé, mais historique non enregistré (${historyError.message}).`,
      );
    }
  }

  result.updated++;
}

async function updateUser(
  supabase: SupabaseClient,
  userId: string,
  coingeckoApiKey: string | undefined,
): Promise<UserResult> {
  const result: UserResult = {
    user_id: userId,
    updated: 0,
    errors: [],
    warnings: [],
  };

  // Récupération des actifs réellement détenus par cet utilisateur.
  const { data: positions, error: positionsError } = await supabase
    .from("positions")
    .select("asset_id")
    .eq("user_id", userId);

  if (positionsError) {
    result.errors.push(
      `Impossible de récupérer les positions : ${positionsError.message}`,
    );
    return result;
  }

  const assetIds = [
    ...new Set(
      (positions ?? [])
        .map((position) => position.asset_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (assetIds.length === 0) {
    return result;
  }

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select(
      "id,user_id,name,asset_type,currency,quote_provider,quote_symbol,is_manual_quote",
    )
    .eq("user_id", userId)
    .in("id", assetIds);

  if (assetsError) {
    result.errors.push(
      `Impossible de récupérer les actifs : ${assetsError.message}`,
    );
    return result;
  }

  const eligibleAssets = (assets ?? []).filter(
    (asset: Asset) =>
      asset.is_manual_quote === false &&
      Boolean(asset.quote_provider) &&
      Boolean(asset.quote_symbol),
  ) as Asset[];

  if (eligibleAssets.length === 0) {
    return result;
  }

  const cryptoAssets = eligibleAssets.filter(isCrypto);
  const otherAssets = eligibleAssets.filter((asset) => !isCrypto(asset));

  // --------------------------------------------------
  // CRYPTOMONNAIES : CoinGecko
  // --------------------------------------------------

  if (cryptoAssets.length > 0) {
    if (!coingeckoApiKey) {
      result.errors.push(
        "COINGECKO_API_KEY manquante : actualisation des cryptomonnaies impossible.",
      );
    } else {
      const cryptoIds = [
        ...new Set(
          cryptoAssets
            .map((asset) => asset.quote_symbol!)
            .filter(Boolean),
        ),
      ];

      try {
        const url =
          "https://api.coingecko.com/api/v3/simple/price" +
          `?ids=${encodeURIComponent(cryptoIds.join(","))}` +
          "&vs_currencies=eur";

        const response = await fetch(url, {
          headers: {
            "x-cg-demo-api-key": coingeckoApiKey,
          },
        });

        if (!response.ok) {
          throw new Error(
            `CoinGecko HTTP ${response.status}: ${await response.text()}`,
          );
        }

        const data = (await response.json()) as Record<
          string,
          { eur?: number }
        >;

        for (const asset of cryptoAssets) {
          const symbol = asset.quote_symbol!;
          const price = data[symbol]?.eur;

          if (typeof price !== "number" || !Number.isFinite(price)) {
            result.errors.push(
              `${asset.name}: cours EUR introuvable sur CoinGecko pour ${symbol}.`,
            );
            continue;
          }

          await saveQuote(
            supabase,
            asset,
            price,
            "EUR",
            "CoinGecko",
            new Date().toISOString(),
            result,
          );
        }
      } catch (error) {
        result.errors.push(
          `Erreur CoinGecko : ${getErrorMessage(error)}`,
        );
      }
    }
  }

  // --------------------------------------------------
  // ACTIONS ET ETF : Yahoo Finance
  // --------------------------------------------------

  for (const asset of otherAssets) {
    const symbol = asset.quote_symbol!;

    try {
      const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/` +
        `${encodeURIComponent(symbol)}?range=5d&interval=1d`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Yahoo Finance HTTP ${response.status}`);
      }

      const data = await response.json();

      const chartResult = data?.chart?.result?.[0];

      if (!chartResult) {
        const description =
          data?.chart?.error?.description ?? "Aucune donnée disponible.";
        throw new Error(description);
      }

      const timestamps: number[] = chartResult.timestamp ?? [];
      const closes: (number | null)[] =
        chartResult.indicators?.quote?.[0]?.close ?? [];

      let lastValidIndex = -1;

      for (let i = closes.length - 1; i >= 0; i--) {
        if (
          typeof closes[i] === "number" &&
          Number.isFinite(closes[i]) &&
          closes[i]! > 0
        ) {
          lastValidIndex = i;
          break;
        }
      }

      if (lastValidIndex === -1) {
        throw new Error("Aucun cours de clôture valide.");
      }

      const price = closes[lastValidIndex]!;
      const currency =
        chartResult.meta?.currency ?? asset.currency ?? "USD";

      const timestamp = timestamps[lastValidIndex];

      const quotedAt = timestamp
        ? new Date(timestamp * 1000).toISOString()
        : new Date().toISOString();

      await saveQuote(
        supabase,
        asset,
        price,
        currency,
        "Yahoo Finance",
        quotedAt,
        result,
      );
    } catch (error) {
      result.errors.push(
        `${asset.name} (${symbol}) : ${getErrorMessage(error)}`,
      );
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Méthode non autorisée. Utilise POST." },
      405,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const coingeckoApiKey = Deno.env.get("COINGECKO_API_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!supabaseUrl) {
    return jsonResponse(
      { error: "Configuration manquante : SUPABASE_URL." },
      500,
    );
  }

  // --------------------------------------------------
  // MODE CRON : authentification par secret serveur
  // --------------------------------------------------

  const receivedCronSecret = req.headers.get("x-cron-secret");
  const isCronRequest =
    Boolean(receivedCronSecret) &&
    Boolean(cronSecret) &&
    constantTimeEqual(receivedCronSecret!, cronSecret!);

  if (receivedCronSecret && !isCronRequest) {
    return jsonResponse({ error: "Secret Cron invalide." }, 401);
  }

  if (isCronRequest) {
    if (!serviceRoleKey) {
      return jsonResponse(
        { error: "Configuration manquante : SUPABASE_SERVICE_ROLE_KEY." },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Le Cron traite tous les utilisateurs ayant des positions.
    const { data: positions, error } = await supabase
      .from("positions")
      .select("user_id");

    if (error) {
      return jsonResponse(
        {
          error: "Impossible de récupérer les utilisateurs.",
          details: error.message,
        },
        500,
      );
    }

    const userIds = [
      ...new Set(
        (positions ?? [])
          .map((position) => position.user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const results: UserResult[] = [];

    for (const userId of userIds) {
      try {
        results.push(
          await updateUser(supabase, userId, coingeckoApiKey),
        );
      } catch (error) {
        results.push({
          user_id: userId,
          updated: 0,
          errors: [getErrorMessage(error)],
          warnings: [],
        });
      }
    }

    const totalUpdated = results.reduce(
      (total, item) => total + item.updated,
      0,
    );

    return jsonResponse({
      success: true,
      mode: "cron",
      users_processed: results.length,
      total_updated: totalUpdated,
      results,
    });
  }

  // --------------------------------------------------
  // MODE MANUEL : authentification utilisateur
  // --------------------------------------------------

  if (!anonKey) {
    return jsonResponse(
      { error: "Configuration manquante : SUPABASE_ANON_KEY." },
      500,
    );
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "Authentification requise." },
      401,
    );
  }

  const token = authorization.slice("Bearer ".length);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: userData, error: authError } =
    await supabase.auth.getUser(token);

  if (authError || !userData.user) {
    return jsonResponse(
      { error: "Session utilisateur invalide ou expirée." },
      401,
    );
  }

  try {
    const result = await updateUser(
      supabase,
      userData.user.id,
      coingeckoApiKey,
    );

    return jsonResponse({
      success: result.errors.length === 0,
      mode: "manual",
      updated: result.updated,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error),
      },
      500,
    );
  }
});

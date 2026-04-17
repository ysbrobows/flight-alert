const buildSearchUrl = (env) => {
  const query = new URLSearchParams({
    departure_id: env.DEPARTURE_ID,
    arrival_id: env.ARRIVAL_ID,
    outbound_date: env.OUTBOUND_DATE,
    travel_class: env.TRAVEL_CLASS,
    adults: env.ADULTS,
    show_hidden: env.SHOW_HIDDEN,
    currency: env.CURRENCY,
    language_code: env.LANGUAGE_CODE,
    country_code: env.COUNTRY_CODE,
    search_type: env.SEARCH_TYPE
  });

  return `${env.RAPIDAPI_BASE_URL}?${query.toString()}`;
};

const formatPrice = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);

const formatExecutionDateTime = (value) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo"
  }).format(value);

const getFlightsBelowTarget = (payload, maxPrice) => {
  const topFlights = payload?.data?.topFlights ?? [];
  const otherFlights = payload?.data?.otherFlights ?? [];

  return [...topFlights, ...otherFlights]
    .filter(
      (flight) =>
        typeof flight?.price === "number" &&
        flight.price < maxPrice &&
        flight?.stops === 0
    )
    .sort((a, b) => a.price - b.price);
};

const getMainSegment = (flight) => flight?.flights?.[0] ?? null;

const buildEmailHtml = (flights, env, now) => {
  const executionDateTime = formatExecutionDateTime(now);

  if (flights.length === 0) {
    return `<h2>Nenhum voo direto abaixo de ${formatPrice(Number(env.MAX_PRICE_BRL))}</h2>
<p>Rota: ${env.DEPARTURE_ID} -> ${env.ARRIVAL_ID}</p>
<p>Data do voo: ${env.OUTBOUND_DATE}</p>
<p>Execução: ${executionDateTime}</p>
<p>Nenhuma opção de voo direto dentro do preço alvo foi encontrada nesta execução.</p>`;
  }

  const items = flights
    .map((flight) => {
      const segment = getMainSegment(flight);
      const company = segment?.airline ?? "Companhia não informada";
      const number = segment?.flight_number ?? "Número não informado";
      const departure = flight?.departure_time ?? "Horário não informado";
      const arrival = flight?.arrival_time ?? "Horário não informado";
      const duration = flight?.duration?.text ?? "Duração não informada";

      return `<li><strong>${formatPrice(flight.price)}</strong> - ${company} (${number}) | Saída: ${departure} | Chegada: ${arrival} | Duração: ${duration}</li>`;
    })
    .join("");

  return `<h2>Alerta de voo abaixo de ${formatPrice(Number(env.MAX_PRICE_BRL))}</h2>
<p>Rota: ${env.DEPARTURE_ID} -> ${env.ARRIVAL_ID}</p>
<p>Data do voo: ${env.OUTBOUND_DATE}</p>
<p>Execução: ${executionDateTime}</p>
<ul>${items}</ul>`;
};

const sendEmailAlert = async (flights, env, now) => {
  const hasMatches = flights.length > 0;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.ALERT_SENDER,
      to: [env.ALERT_RECIPIENT],
      subject: hasMatches
        ? `Voo ${env.DEPARTURE_ID} -> ${env.ARRIVAL_ID} abaixo de ${formatPrice(Number(env.MAX_PRICE_BRL))}`
        : `Nenhum voo ${env.DEPARTURE_ID} -> ${env.ARRIVAL_ID} abaixo de ${formatPrice(Number(env.MAX_PRICE_BRL))}`,
      html: buildEmailHtml(flights, env, now)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao enviar e-mail: ${response.status} ${text}`);
  }
};

const runCheck = async (env) => {
  const now = new Date();
  const maxPrice = Number(env.MAX_PRICE_BRL);
  const url = buildSearchUrl(env);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": env.RAPIDAPI_HOST,
      "x-rapidapi-key": env.RAPIDAPI_KEY
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha na API de voos: ${response.status} ${text}`);
  }

  const payload = await response.json();
  const cheapFlights = getFlightsBelowTarget(payload, maxPrice);
  await sendEmailAlert(cheapFlights, env, now);

  if (cheapFlights.length === 0) {
    return {
      notified: true,
      matches: 0,
      message: `Nenhum voo direto abaixo de ${formatPrice(maxPrice)}`
    };
  }

  return {
    notified: true,
    matches: cheapFlights.length,
    bestPrice: cheapFlights[0].price
  };
};

export default {
  async fetch(request, env) {
    try {
      const result = await runCheck(env);
      return new Response(JSON.stringify(result, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    } catch (error) {
      return new Response(
        JSON.stringify(
          {
            error: error instanceof Error ? error.message : "Erro desconhecido"
          },
          null,
          2
        ),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCheck(env));
  }
};

-- Migration 004: View de projecao de fluxo de caixa (proximos 90 dias)
-- Execute no Supabase SQL Editor

-- Calcula, dia a dia nos proximos 90 dias, o saldo projetado considerando:
--   - Saldo atual (entradas recebidas - saidas pagas)
--   - Transacoes pendentes com vencimento no periodo
--   - Transacoes vencidas (status = 'vencido' ou due_date < hoje) sao aplicadas em "hoje"

CREATE OR REPLACE VIEW public.v_cashflow_projection AS
WITH saldo_inicial AS (
  SELECT COALESCE(
    SUM(CASE WHEN type = 'entrada' AND status = 'recebido' THEN amount END) -
    SUM(CASE WHEN type = 'saida'   AND status = 'pago'     THEN amount END),
    0
  ) AS saldo
  FROM public.transactions
),
days AS (
  SELECT generate_series(
    current_date,
    current_date + INTERVAL '90 days',
    INTERVAL '1 day'
  )::date AS day
),
movements AS (
  SELECT
    CASE
      WHEN status = 'vencido' OR due_date < current_date THEN current_date
      ELSE due_date::date
    END AS day,
    type,
    amount
  FROM public.transactions
  WHERE status IN ('pendente', 'vencido')
    AND due_date <= current_date + INTERVAL '90 days'
),
movements_agg AS (
  SELECT
    day,
    SUM(CASE WHEN type = 'entrada' THEN amount ELSE 0 END) AS entrada_dia,
    SUM(CASE WHEN type = 'saida'   THEN amount ELSE 0 END) AS saida_dia
  FROM movements
  GROUP BY day
),
daily AS (
  SELECT
    d.day,
    COALESCE(m.entrada_dia, 0) AS entradas,
    COALESCE(m.saida_dia,   0) AS saidas,
    COALESCE(m.entrada_dia, 0) - COALESCE(m.saida_dia, 0) AS variacao
  FROM days d
  LEFT JOIN movements_agg m ON m.day = d.day
)
SELECT
  to_char(day, 'YYYY-MM-DD') AS day,
  to_char(day, 'DD/MM')      AS day_label,
  entradas,
  saidas,
  (SELECT saldo FROM saldo_inicial) +
    SUM(variacao) OVER (ORDER BY day) AS saldo_projetado
FROM daily
ORDER BY day;

-- Permissoes: views herdam RLS das tabelas-base; libera SELECT pro usuario logado
GRANT SELECT ON public.v_cashflow_projection TO authenticated;

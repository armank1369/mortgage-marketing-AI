"""Data access for public.model_comparison (two-model comparison beta).

The table is created by docs/database/model_comparison.sql, which must be applied
to the target Neon branch before the beta is turned on. Every query is scoped to
the caller's workspace.
"""
from typing import Any, Dict, List, Optional

import psycopg
from psycopg.types.json import Jsonb

from db.connection import get_db_cursor
from errors import DatabaseUnavailableError
from logging_utils import log_db_error, log_db_operation


def _run(operation, workspace_id, work):
    try:
        with get_db_cursor(commit=True) as cursor:
            result = work(cursor)
            log_db_operation(operation, workspace_id=workspace_id, status="success")
            return result
    except psycopg.OperationalError as error:
        log_db_error(operation, error, workspace_id=workspace_id)
        raise DatabaseUnavailableError() from error
    except Exception as error:
        log_db_error(operation, error, workspace_id=workspace_id)
        raise


def create_comparison(workspace_id: str, member_id: str, persona_id: Optional[str], prompt: str,
                      candidates: List[Dict[str, Any]], estimated_cost_usd: Optional[float]) -> str:
    def work(cursor):
        cursor.execute(
            """
            INSERT INTO public.model_comparison
                (workspace_id, created_by_member_id, persona_id, prompt, candidates, estimated_cost_usd)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (workspace_id, member_id, persona_id, prompt, Jsonb(candidates), estimated_cost_usd),
        )
        return str(cursor.fetchone()["id"])
    return _run("create_model_comparison", workspace_id, work)


def record_choice(workspace_id: str, comparison_id: str, member_id: str, choice: str,
                  note: Optional[str]) -> Optional[Dict[str, Any]]:
    def work(cursor):
        cursor.execute(
            """
            UPDATE public.model_comparison
            SET chosen_slot = %s, note = %s, chosen_by_member_id = %s, chosen_at = now()
            WHERE id = %s AND workspace_id = %s
            RETURNING id, chosen_slot, candidates, estimated_cost_usd, chosen_at;
            """,
            (choice, note, member_id, comparison_id, workspace_id),
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    return _run("record_model_comparison_choice", workspace_id, work)


def get_comparison(workspace_id: str, comparison_id: str) -> Optional[Dict[str, Any]]:
    def work(cursor):
        cursor.execute(
            """
            SELECT id, persona_id, prompt, candidates, feedback, merges, chosen_slot, estimated_cost_usd
            FROM public.model_comparison
            WHERE id = %s AND workspace_id = %s;
            """,
            (comparison_id, workspace_id),
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    return _run("get_model_comparison", workspace_id, work)


def append_merge(workspace_id: str, comparison_id: str, member_id: str, feedback: Dict[str, Any],
                 merge: Dict[str, Any], expected_rounds: int) -> Optional[Dict[str, Any]]:
    """Append one combine/refine round. Returns None if another round was saved meanwhile.

    Combining counts as the user's preference, so an unvoted comparison is marked 'merged'.
    """
    cost = merge.get("estimated_cost_usd")

    def work(cursor):
        cursor.execute(
            """
            UPDATE public.model_comparison
            SET merges = merges || jsonb_build_array(%s::jsonb),
                feedback = %s,
                estimated_cost_usd = CASE WHEN %s::numeric IS NULL THEN NULL
                                          ELSE estimated_cost_usd + %s::numeric END,
                chosen_slot = COALESCE(chosen_slot, 'merged'),
                chosen_by_member_id = COALESCE(chosen_by_member_id, %s),
                chosen_at = COALESCE(chosen_at, now())
            WHERE id = %s AND workspace_id = %s AND jsonb_array_length(merges) = %s
            RETURNING id, chosen_slot, candidates, merges, estimated_cost_usd;
            """,
            (Jsonb(merge), Jsonb(feedback), cost, cost, member_id, comparison_id, workspace_id, expected_rounds),
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    return _run("append_model_comparison_merge", workspace_id, work)


def comparison_summary(workspace_id: str) -> List[Dict[str, Any]]:
    """Per-model tallies: how often each model was shown, picked, and what it cost."""
    def work(cursor):
        cursor.execute(
            """
            SELECT c.value->>'provider' AS provider,
                   c.value->>'model' AS model,
                   count(*) AS shown,
                   count(*) FILTER (WHERE m.chosen_slot = c.value->>'slot') AS wins,
                   count(*) FILTER (WHERE m.chosen_slot = 'tie') AS ties,
                   count(*) FILTER (WHERE m.chosen_slot = 'merged') AS combined,
                   count(*) FILTER (WHERE m.chosen_slot = 'neither') AS neither,
                   count(*) FILTER (WHERE m.chosen_slot IS NULL) AS unvoted,
                   count(*) FILTER (WHERE c.value ? 'error') AS failures,
                   sum((c.value->>'estimated_cost_usd')::numeric) AS estimated_cost_usd
            FROM public.model_comparison m
            CROSS JOIN LATERAL jsonb_array_elements(m.candidates) AS c(value)
            WHERE m.workspace_id = %s
            GROUP BY 1, 2
            ORDER BY wins DESC, model;
            """,
            (workspace_id,),
        )
        rows = []
        for row in cursor.fetchall():
            row = dict(row)
            cost = row.get("estimated_cost_usd")
            row["estimated_cost_usd"] = float(cost) if cost is not None else None
            row["liked_aspects"] = {}
            rows.append(row)
        # Which parts of each model's drafts the broker kept when combining.
        cursor.execute(
            """
            SELECT c.value->>'provider' AS provider, c.value->>'model' AS model, a.aspect, count(*) AS times
            FROM public.model_comparison m
            CROSS JOIN LATERAL jsonb_array_elements(m.candidates) AS c(value)
            CROSS JOIN LATERAL jsonb_array_elements_text(
                COALESCE(m.feedback -> (c.value->>'slot') -> 'aspects', '[]'::jsonb)) AS a(aspect)
            WHERE m.workspace_id = %s
            GROUP BY 1, 2, 3;
            """,
            (workspace_id,),
        )
        by_model = {(row["provider"], row["model"]): row for row in rows}
        for liked in cursor.fetchall():
            target = by_model.get((liked["provider"], liked["model"]))
            if target is not None:
                target["liked_aspects"][liked["aspect"]] = int(liked["times"])
        return rows
    return _run("model_comparison_summary", workspace_id, work)

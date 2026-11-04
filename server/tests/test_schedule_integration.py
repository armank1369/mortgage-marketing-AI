"""Opt-in only. Requires an approved, migrated disposable DB and synthetic fixture writes."""
import json
from pathlib import Path

import pytest

from errors import ConflictError
from repositories import schedule
from tests.test_step_j_generation_integration import execute, generation_session, provider_result
from tests.test_step_j_integration import durable_session, operation


@pytest.mark.integration
def test_campaign_save_replay_move_and_remove(generation_session):
    workspace, _, member, persona, _ = generation_session
    fixture = json.loads((Path(__file__).resolve().parents[2] / "docs/fixtures/step_j_v1.json").read_text())
    campaign = next(case["payload"]["campaign"] for case in fixture["cases"] if case["type"] == "campaign")
    values = iter(({"proceed": True}, campaign))
    generated = execute(generation_session, operation(persona, message="Create a campaign"),
                        lambda **kwargs: provider_result(next(values)))
    batch = generated["response"]["id"]
    when = {"scheduled_for":"2026-11-03T18:00:00Z", "timezone":"America/Los_Angeles"}
    entry = {**when, "topic":"Synthetic post", "platform":"Instagram","format":"carousel"}
    save = {"action":"save", "batch":batch, "entries":[entry]}
    previous, _ = schedule.snapshot(workspace)
    schedule.mutate(workspace,member,previous,save)
    revision, first = schedule.snapshot(workspace)
    assert first["entries"][0]["batchId"] == batch and len(first["campaigns"]) == 1
    with pytest.raises(ConflictError):
        schedule.mutate(workspace,member,previous,save)
    schedule.mutate(workspace,member,revision,save)
    revision, second = schedule.snapshot(workspace)
    assert [e["id"] for e in second["entries"]] == [first["entries"][0]["id"]]
    assert second["campaigns"] == first["campaigns"]
    assert schedule.snapshot(workspace,revision) == (revision,None)
    entry_id = first["entries"][0]["id"]
    schedule.mutate(workspace,member,revision,{"action":"move","id":entry_id,
                    "entry":{**when,"scheduled_for":"2026-11-04T18:00:00Z"}})
    revision, moved = schedule.snapshot(workspace)
    assert moved["entries"][0]["scheduled_for"].startswith("2026-11-04")
    schedule.mutate(workspace,member,revision,{"action":"remove","ids":[entry_id]})
    _, removed = schedule.snapshot(workspace)
    assert removed["entries"] == [] and len(removed["campaigns"]) == 1


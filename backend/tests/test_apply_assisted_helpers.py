import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.engines.applications import apply_playbook
from app.engines.applications import field_memory
from app.engines.applications import submission_engine


def test_collect_unresolved_required_labels():
    form_fields = [
        {"label": "Email", "required": True},
        {"label": "Why this role?", "required": True},
        {"label": "Portfolio", "required": False},
    ]
    answers = {
        "Email": "[REQUIRES_REVIEW: Email]",
        "Why this role?": "I am excited to contribute.",
    }
    unresolved = submission_engine._collect_unresolved_required_labels(form_fields, answers)
    assert unresolved == ["Email"]


def test_parse_label_value_pairs_supports_json_and_multiline():
    parsed_json = submission_engine._parse_label_value_pairs('{"Email":"dev@example.com","Phone":"123"}')
    assert parsed_json["Email"] == "dev@example.com"
    assert parsed_json["Phone"] == "123"

    parsed_lines = submission_engine._parse_label_value_pairs("Email: dev@example.com\nPhone: 123")
    assert parsed_lines["Email"] == "dev@example.com"
    assert parsed_lines["Phone"] == "123"


def test_apply_playbook_append_and_load(tmp_path, monkeypatch):
    monkeypatch.setattr(apply_playbook, "PLAYBOOK_DIR", tmp_path)
    url = "https://jobs.workday.com/example/apply"
    wrote = apply_playbook.append_apply_playbook_notes_with_score(
        url,
        ["Clicked Apply", "Filled profile fields", "Moved to review page"],
        outcome="ready_for_final_approval",
        confidence=0.88,
        helpful=True,
    )
    assert wrote is True
    loaded = apply_playbook.load_apply_playbook_notes(url)
    assert "Clicked Apply" in loaded
    assert "Filled profile fields" in loaded


def test_apply_playbook_gates_low_confidence_or_non_success(tmp_path, monkeypatch):
    monkeypatch.setattr(apply_playbook, "PLAYBOOK_DIR", tmp_path)
    url = "https://jobs.greenhouse.io/example/apply"

    wrote_low_conf = apply_playbook.append_apply_playbook_notes_with_score(
        url,
        ["Opened apply form", "Selected resume upload", "Filled contact details"],
        outcome="ready_for_final_approval",
        confidence=0.51,
        helpful=True,
    )
    wrote_non_success = apply_playbook.append_apply_playbook_notes_with_score(
        url,
        ["Opened apply form", "Selected resume upload", "Filled contact details"],
        outcome="failed",
        confidence=0.95,
        helpful=True,
    )
    assert wrote_low_conf is False
    assert wrote_non_success is False
    assert apply_playbook.load_apply_playbook_notes(url) == ""


def test_apply_playbook_prunes_stale_sessions(tmp_path, monkeypatch):
    monkeypatch.setattr(apply_playbook, "PLAYBOOK_DIR", tmp_path)
    url = "https://jobs.lever.co/example/apply"
    key = "jobs.lever.co"
    stale = "\n".join(
        [
            f"# Apply Playbook: {key}",
            "",
            "Agent-learned navigation notes for assisted apply flows.",
            "",
            "## Session 2020-01-01 00:00:00Z | outcome=submitted | confidence=0.99",
            "- stale note should be dropped",
            "",
        ]
    )
    path = tmp_path / f"{key}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(stale, encoding="utf-8")

    wrote = apply_playbook.append_apply_playbook_notes_with_score(
        url,
        ["Opened application tab", "Clicked apply button", "Completed profile basics"],
        outcome="submitted",
        confidence=0.93,
        helpful=True,
    )
    assert wrote is True

    text = path.read_text(encoding="utf-8")
    assert "stale note should be dropped" not in text
    loaded = apply_playbook.load_apply_playbook_notes(url)
    assert "Opened application tab" in loaded


def test_field_memory_reuses_profile_answers(tmp_path, monkeypatch):
    monkeypatch.setattr(field_memory, "MEMORY_DIR", tmp_path)
    profile_id = "testprofile"
    domain = "jobs.workday.com"
    wrote = field_memory.remember_answers(
        profile_id,
        domain,
        {
            "Phone number": "+1 555 123 9999",
            "LinkedIn URL": "https://linkedin.com/in/example",
            "Why this role?": "Very long answer that should not be stored because it has many many words and is not a short reusable personal answer for repeated field filling.",
        },
    )
    assert wrote >= 2
    recalled = field_memory.recall_answers(
        profile_id,
        domain,
        ["Phone number", "LinkedIn URL", "Why this role?"],
    )
    assert recalled["Phone number"] == "+1 555 123 9999"
    assert recalled["LinkedIn URL"] == "https://linkedin.com/in/example"
    assert "Why this role?" not in recalled


def test_memory_write_scoring_helper_accepts_strong_runs():
    should_write, confidence, _ = submission_engine._evaluate_playbook_memory_write(
        run_status="submitted",
        ai_actions_executed=9,
        note_count=8,
        user_gates_triggered=0,
        clarification_rounds=0,
        had_missing_required_block=False,
    )
    assert should_write is True
    assert confidence >= 0.72


def test_memory_write_scoring_helper_rejects_weak_runs():
    should_write, confidence, _ = submission_engine._evaluate_playbook_memory_write(
        run_status="ready_for_final_approval",
        ai_actions_executed=1,
        note_count=2,
        user_gates_triggered=3,
        clarification_rounds=2,
        had_missing_required_block=True,
    )
    assert should_write is False
    assert confidence < 0.72

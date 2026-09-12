import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any


TIER_LABELS = {
    'high': ('High (80%+)', '#22c55e'),
    'medium': ('Medium (60-79%)', '#f59e0b'),
    'low': ('Low (<60%)', '#6b7280'),
}


def _parse_json_array(raw: Any) -> list[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            value = json.loads(raw)
            return value if isinstance(value, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _as_skill_name(item: Any) -> str | None:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        name = item.get('name')
        if isinstance(name, str):
            return name.strip()
    return None


def compute_metrics(db_conn) -> dict[str, Any]:
    cursor = db_conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM application_drafts WHERE status != 'drafted'")
    total_applications = cursor.fetchone()[0] or 0

    cursor.execute(
        """
        SELECT COUNT(*)
        FROM application_drafts
        WHERE status IN ('interview', 'offer', 'rejected')
          AND response_time_days IS NOT NULL
        """
    )
    responses = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COUNT(*) FROM application_drafts WHERE status IN ('interview', 'offer')")
    interviews = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COUNT(*) FROM application_drafts WHERE status = 'offer'")
    offers = cursor.fetchone()[0] or 0

    response_rate = round((responses / total_applications) * 100, 2) if total_applications else 0.0
    interview_rate = round((interviews / total_applications) * 100, 2) if total_applications else 0.0
    offer_rate = round((offers / total_applications) * 100, 2) if total_applications else 0.0

    window_days = 30
    since_date = (datetime.now(timezone.utc) - timedelta(days=window_days)).strftime('%Y-%m-%d')

    cursor.execute(
        """
        SELECT date(submitted_at) AS day, COUNT(*) AS count
        FROM application_drafts
        WHERE submitted_at IS NOT NULL AND date(submitted_at) >= ?
        GROUP BY date(submitted_at)
        ORDER BY day
        """,
        (since_date,),
    )
    applications_over_time = [
        {'date': row[0], 'count': row[1]} for row in cursor.fetchall() if row[0]
    ]

    cursor.execute(
        """
        SELECT date(submitted_at) AS day,
               COUNT(*) AS total,
               SUM(CASE WHEN status IN ('interview', 'offer') THEN 1 ELSE 0 END) AS interviews
        FROM application_drafts
        WHERE submitted_at IS NOT NULL AND date(submitted_at) >= ?
        GROUP BY date(submitted_at)
        ORDER BY day
        """,
        (since_date,),
    )
    interview_rate_over_time = []
    for day, total, day_interviews in cursor.fetchall():
        total = total or 0
        day_interviews = day_interviews or 0
        rate = round((day_interviews / total) * 100, 2) if total else 0.0
        interview_rate_over_time.append({'date': day, 'rate': rate})

    cursor.execute(
        """
        SELECT COALESCE(j.match_tier, 'low') AS tier, COUNT(*) AS count
        FROM application_drafts a
        LEFT JOIN jobs j ON j.id = a.job_id
        WHERE a.status != 'drafted'
        GROUP BY COALESCE(j.match_tier, 'low')
        """
    )
    match_distribution = []
    for tier, count in cursor.fetchall():
        label, color = TIER_LABELS.get((tier or 'low').lower(), TIER_LABELS['low'])
        match_distribution.append({'tier': label, 'count': count, 'color': color})

    cursor.execute(
        """
        SELECT a.resume_version_id,
               COUNT(*) AS total,
               SUM(CASE WHEN a.status IN ('interview', 'offer') THEN 1 ELSE 0 END) AS interviews
        FROM application_drafts a
        WHERE a.resume_version_id IS NOT NULL
          AND a.status != 'drafted'
        GROUP BY a.resume_version_id
        HAVING COUNT(*) >= 3
        """
    )
    best_resume_id = ''
    best_resume_label = ''
    best_rate = -1.0
    for resume_version_id, total, resume_interviews in cursor.fetchall():
        total = total or 0
        resume_interviews = resume_interviews or 0
        rate = (resume_interviews / total) if total else 0.0
        if rate > best_rate:
            best_rate = rate
            best_resume_id = resume_version_id

    if best_resume_id:
        cursor.execute("SELECT COALESCE(label, id) FROM resume_versions WHERE id = ?", (best_resume_id,))
        row = cursor.fetchone()
        best_resume_label = row[0] if row else best_resume_id

    cursor.execute(
        """
        SELECT j.skills_required_json
        FROM application_drafts a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.status = 'rejected'
           OR (a.status = 'submitted' AND a.response_time_days IS NULL)
        """
    )
    candidate_job_skills = [row[0] for row in cursor.fetchall()]

    cursor.execute("SELECT skills_json FROM user_profile LIMIT 1")
    profile_row = cursor.fetchone()
    user_skills = set()
    if profile_row:
        for item in _parse_json_array(profile_row[0]):
            name = _as_skill_name(item)
            if name:
                user_skills.add(name.lower())

    missing_counter: Counter[str] = Counter()
    for raw_skills in candidate_job_skills:
        for item in _parse_json_array(raw_skills):
            name = _as_skill_name(item)
            if not name:
                continue
            if name.lower() not in user_skills:
                missing_counter[name] += 1

    top_missing_skill = missing_counter.most_common(1)[0][0] if missing_counter else 'N/A'

    cursor.execute("SELECT mock_scores_json FROM interview_kits")
    mock_sessions_count = 0
    mock_score_total = 0.0
    for (raw_mock_scores,) in cursor.fetchall():
        for item in _parse_json_array(raw_mock_scores):
            if not isinstance(item, dict):
                continue
            final = item.get('finalScore')
            try:
                final_num = float(final)
            except (TypeError, ValueError):
                continue
            if final_num < 0:
                continue
            mock_sessions_count += 1
            mock_score_total += final_num
    average_mock_score = round((mock_score_total / mock_sessions_count), 2) if mock_sessions_count else 0.0

    return {
        'totalApplications': total_applications,
        'responseRate': response_rate,
        'interviewRate': interview_rate,
        'offerRate': offer_rate,
        'bestResumeVersionId': best_resume_id,
        'bestResumeVersionLabel': best_resume_label,
        'topMissingSkill': top_missing_skill,
        'applicationsOverTime': applications_over_time,
        'interviewRateOverTime': interview_rate_over_time,
        'matchDistribution': match_distribution,
        'windowDays': window_days,
        'mockSessionsCount': mock_sessions_count,
        'averageMockScore': average_mock_score,
    }

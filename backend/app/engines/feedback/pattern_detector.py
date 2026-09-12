import json
from collections import Counter


def _parse_json_array(raw):
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


def detect_patterns(db_conn) -> list[str]:
    cursor = db_conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM application_drafts WHERE status != 'drafted'")
    total_submitted = cursor.fetchone()[0] or 0
    if total_submitted < 10:
        return []

    insights: list[str] = []

    cursor.execute(
        """
        SELECT j.skills_required_json
        FROM application_drafts a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.status = 'rejected'
        """
    )
    rejected_rows = cursor.fetchall()
    if rejected_rows:
        skill_counter: Counter[str] = Counter()
        for (raw_skills,) in rejected_rows:
            for skill in _parse_json_array(raw_skills):
                if isinstance(skill, dict):
                    skill_name = skill.get('name')
                else:
                    skill_name = skill
                if isinstance(skill_name, str) and skill_name.strip():
                    skill_counter[skill_name.strip()] += 1

        if skill_counter:
            skill, count = skill_counter.most_common(1)[0]
            pct = round((count / len(rejected_rows)) * 100)
            if pct > 40:
                insights.append(
                    f"You're missing {skill} in {pct}% of roles you apply to - consider building this skill"
                )

    cursor.execute(
        """
        SELECT j.match_tier,
               COUNT(*) AS total,
               SUM(CASE WHEN a.status IN ('interview', 'offer') THEN 1 ELSE 0 END) AS interviews
        FROM application_drafts a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.status != 'drafted'
        GROUP BY j.match_tier
        """
    )
    tier_stats = {row[0]: {'total': row[1] or 0, 'interviews': row[2] or 0} for row in cursor.fetchall()}

    high = tier_stats.get('high', {'total': 0, 'interviews': 0})
    medium = tier_stats.get('medium', {'total': 0, 'interviews': 0})
    high_rate = (high['interviews'] / high['total']) if high['total'] else 0.0
    medium_rate = (medium['interviews'] / medium['total']) if medium['total'] else 0.0
    if high_rate - medium_rate > 0.15:
        insights.append("Your interview rate is higher for roles with >70% match - focus on high-match jobs")

    cursor.execute("PRAGMA table_info(jobs)")
    job_columns = {row[1] for row in cursor.fetchall()}
    if 'domain' in job_columns:
        cursor.execute(
            """
            SELECT COALESCE(j.domain, 'unknown') AS domain,
                   COUNT(*) AS total,
                   SUM(CASE WHEN a.status IN ('interview', 'offer') THEN 1 ELSE 0 END) AS interviews
            FROM application_drafts a
            JOIN jobs j ON j.id = a.job_id
            WHERE a.status != 'drafted'
            GROUP BY COALESCE(j.domain, 'unknown')
            """
        )
        rows = cursor.fetchall()
        domain_rates = []
        for domain, total, interviews in rows:
            total = total or 0
            interviews = interviews or 0
            rate = (interviews / total) if total else 0.0
            domain_rates.append((domain, rate))

        if len(domain_rates) > 1:
            domain_rates.sort(key=lambda item: item[1], reverse=True)
            best_domain, best_rate = domain_rates[0]
            other_rates = [rate for _, rate in domain_rates[1:] if rate > 0]
            if other_rates and best_rate > 2 * (sum(other_rates) / len(other_rates)):
                insights.append(
                    f"You're getting more traction in {best_domain} - consider targeting more {best_domain} roles"
                )

    return insights[:5]

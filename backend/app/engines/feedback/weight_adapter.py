import json


DEFAULT_WEIGHTS = {
    'skill_match': 0.6,
    'experience_match': 0.2,
    'domain_match': 0.2,
}


def _normalize(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        return DEFAULT_WEIGHTS.copy()
    return {key: round(value / total, 6) for key, value in weights.items()}


def adapt_weights(db_conn) -> dict[str, float]:
    cursor = db_conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM application_drafts WHERE status != 'drafted'")
    total_submitted = cursor.fetchone()[0] or 0

    weights = DEFAULT_WEIGHTS.copy()

    if total_submitted >= 20:
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

        delta = 0.05
        if high_rate > medium_rate:
            weights['skill_match'] = min(0.75, weights['skill_match'] + delta)
        else:
            weights['skill_match'] = max(0.45, weights['skill_match'] - delta)

        remainder = 1.0 - weights['skill_match']
        weights['experience_match'] = remainder / 2
        weights['domain_match'] = remainder / 2

    weights = _normalize(weights)

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS insights_cache (
            id INTEGER PRIMARY KEY,
            rolling_metrics_json TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )
        """
    )

    cursor.execute("PRAGMA table_info(insights_cache)")
    columns = {row[1] for row in cursor.fetchall()}
    if 'weights_json' not in columns:
        cursor.execute("ALTER TABLE insights_cache ADD COLUMN weights_json TEXT")

    cursor.execute(
        """
        INSERT INTO insights_cache (id, weights_json, updated_at)
        VALUES (1, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          weights_json = excluded.weights_json,
          updated_at = excluded.updated_at
        """,
        (json.dumps(weights),),
    )
    db_conn.commit()

    return weights

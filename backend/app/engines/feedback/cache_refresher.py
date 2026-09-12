import json
import logging

from .aggregator import compute_metrics
from .pattern_detector import detect_patterns
from .weight_adapter import adapt_weights

logger = logging.getLogger(__name__)


async def refresh_insights_cache(db_conn) -> dict:
    cursor = db_conn.cursor()

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
    if 'patterns_json' not in columns:
        cursor.execute("ALTER TABLE insights_cache ADD COLUMN patterns_json TEXT")
    if 'weights_json' not in columns:
        cursor.execute("ALTER TABLE insights_cache ADD COLUMN weights_json TEXT")

    metrics = compute_metrics(db_conn)
    patterns = detect_patterns(db_conn)
    weights = adapt_weights(db_conn)

    cursor.execute(
        """
        INSERT INTO insights_cache (id, rolling_metrics_json, patterns_json, weights_json, updated_at)
        VALUES (1, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          rolling_metrics_json = excluded.rolling_metrics_json,
          patterns_json = excluded.patterns_json,
          weights_json = excluded.weights_json,
          updated_at = excluded.updated_at
        """,
        (
            json.dumps(metrics),
            json.dumps(patterns),
            json.dumps(weights),
        ),
    )
    db_conn.commit()

    logger.info('Insights cache refreshed')
    return metrics

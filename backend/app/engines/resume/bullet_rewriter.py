"""Bullet Rewriter — uses Gemini to tailor resume bullets for a specific role.

STRICT RULES (enforced by prompt and post-processing):
- Preserve ALL factual claims exactly as written
- Do NOT add metrics, numbers, or technologies not in the original
- Keep to one line, under 120 characters
- Start with an action verb
- If rewritten bullet is > 50% longer than original → use original
- If Gemini fails → return original bullet unchanged
"""

import logging

from ...clients.gemini import get_gemini_client

logger = logging.getLogger(__name__)

_REWRITE_PROMPT = (
    "Rewrite this resume bullet to emphasize {skills} for a {domain} role.\n"
    "Rules:\n"
    "- Preserve ALL factual claims exactly as written\n"
    "- Do NOT add metrics, numbers, or technologies not in the original\n"
    "- Do NOT change the technologies mentioned\n"
    "- Keep to one line, under 120 characters\n"
    "- Start with an action verb\n"
    "- Return ONLY the rewritten bullet, no explanation\n\n"
    "Original: {bullet}"
)


def _already_contains_skills(bullet: str, target_skills: list[str]) -> bool:
    """Return True if the bullet already mentions all target skills."""
    text_lower = bullet.lower()
    return all(skill.lower() in text_lower for skill in target_skills)


async def rewrite_bullet(
    original_bullet: str,
    required_skills: list[str],
    job_domain: str,
) -> str:
    """Rewrite *original_bullet* to emphasise *required_skills* for *job_domain*.

    Returns the original bullet unchanged when:
    - Gemini is unavailable
    - The bullet already contains the target skills
    - The rewritten version is > 50 % longer than the original
    - Any error occurs during generation
    """
    # Skip rewriting if already aligned
    if _already_contains_skills(original_bullet, required_skills):
        return original_bullet

    client = get_gemini_client()
    if client is None:
        logger.info("Gemini unavailable — returning original bullet")
        return original_bullet

    try:
        prompt = _REWRITE_PROMPT.format(
            skills=", ".join(required_skills[:5]),  # cap to avoid huge prompts
            domain=job_domain,
            bullet=original_bullet,
        )
        response = await client.generate_content_async(prompt)
        rewritten = response.text.strip().strip('"').strip("'")

        # Guard: reject if > 50 % longer
        if len(rewritten) > len(original_bullet) * 1.5:
            logger.info(
                "Rewritten bullet too long (%d vs %d chars) — keeping original",
                len(rewritten),
                len(original_bullet),
            )
            return original_bullet

        # Guard: reject if empty or suspiciously short
        if len(rewritten) < 10:
            return original_bullet

        return rewritten
    except Exception:
        logger.exception("Bullet rewrite failed — returning original")
        return original_bullet

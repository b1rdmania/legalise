"""Business logic for the example module. Kept thin — most modules will have
more here, but the shape stays the same: take matter context, return data."""


def build_prompt(matter) -> str:
    """Build a one-line introduction prompt from the matter context."""
    return (
        f"You are reviewing the matter '{matter.title}'. "
        f"In one sentence, summarise the case theory: {matter.case_theory or 'not yet set'}."
    )

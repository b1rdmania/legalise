"""Plugin bridge — invokes claude-for-uk-legal skills with matter context.

v0.1 strategy: **direct skill rendering.** The bridge reads the skill's
SKILL.md file, parses its YAML frontmatter, builds a single prompt that
combines the matter context with the skill body, dispatches through the
model gateway under the matter's privilege posture, and writes both a
`plugin.invoked` audit row (this layer) and a `model.call` audit row
(the gateway). Result is returned to the caller.

v0.2 will migrate to MCP server invocation against the plugin suite's
hosted endpoints. The Python contract here stays stable — only the
underlying transport changes.

Single-call rendering by design. Pre-Motion's full four-stage
adversarial pipeline (Optimistic Analyst → Evidence Inspector ×3
parallel sub-agents → Premortem Adversary ×4 parallel sub-agents →
Synthesiser) was ported to `app.modules.pre_motion` at Day 6 and has
its own dedicated endpoint and orchestrator. The bridge here remains
the single-call surface for every other plugin skill (e.g. letters,
disclosure lists, settlement-helper) — modules that need richer
multi-agent orchestration build their own pipeline against the
gateway, as Pre-Motion does.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

import frontmatter
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.model_gateway import ModelGateway, PrivilegePosture
from app.models import Matter, WorkspaceDisabledSkill

logger = structlog.get_logger()


@dataclass
class SkillManifest:
    """Parsed shape of a SKILL.md file."""

    name: str
    description: str
    argument_hint: str | None
    body: str  # the prompt template — everything after the frontmatter


class SkillDisabled(Exception):
    """Raised when a user invokes a `(plugin, skill)` pair they have
    disabled in their workspace. Routers map this to HTTP 403."""

    def __init__(self, plugin: str, skill: str):
        self.plugin = plugin
        self.skill = skill
        super().__init__(f"skill disabled for this workspace: {plugin}/{skill}")


@dataclass
class PluginInvocationResult:
    plugin: str
    skill: str
    matter_slug: str
    response_text: str
    model_used: str
    token_count: int
    latency_ms: int


def _parse_skill_md(text: str) -> SkillManifest:
    """Parse a SKILL.md via python-frontmatter. The body is returned
    verbatim; the frontmatter must declare `name` (everything else is
    optional)."""
    if not text.startswith("---"):
        raise ValueError("SKILL.md must start with YAML frontmatter delimited by '---'")
    try:
        post = frontmatter.loads(text)
    except Exception as exc:
        raise ValueError(f"SKILL.md frontmatter parse failed: {exc}") from exc

    metadata = post.metadata or {}
    name = str(metadata.get("name", "")).strip()
    if not name:
        raise ValueError("SKILL.md frontmatter missing `name`")

    description_raw = metadata.get("description", "")
    description = str(description_raw).strip() if description_raw is not None else ""

    hint_raw = metadata.get("argument-hint")
    argument_hint = str(hint_raw).strip() if hint_raw is not None else None

    return SkillManifest(
        name=name,
        description=description,
        argument_hint=argument_hint,
        body=post.content,
    )


def _render_matter_block(matter: Matter) -> str:
    """Build the matter-context block injected into every plugin prompt."""
    lines = [
        f"matter_id: {matter.slug}",
        f"title: {matter.title}",
        f"type: {matter.matter_type}",
    ]
    if matter.cause:
        lines.append(f"cause: {matter.cause}")
    lines.append(f"privilege_posture: {matter.privilege_posture}")
    if matter.case_theory:
        lines.append("")
        lines.append("CASE THEORY")
        lines.append("-----------")
        lines.append(matter.case_theory.strip())
    if matter.pivot_fact:
        lines.append("")
        lines.append("PIVOT FACT")
        lines.append("----------")
        lines.append(matter.pivot_fact.strip())
    # Key dates, if present in facts.
    key_dates = (matter.facts or {}).get("key_dates") or []
    if key_dates:
        lines.append("")
        lines.append("KEY DATES")
        lines.append("---------")
        for kd in key_dates:
            label = kd.get("label", "")
            date = kd.get("date", "")
            lines.append(f"- {date}  {label}")
    return "\n".join(lines)


class PluginBridge:
    """Calls a skill from the claude-for-uk-legal plugin suite, in process."""

    def __init__(self, plugins_root: Path, gateway: ModelGateway):
        self._plugins_root = Path(plugins_root)
        self._gateway = gateway

    def _skill_path(self, plugin: str, skill: str) -> Path:
        # Guard: plugin / skill names must be simple identifiers — no `..`,
        # no slashes. The on-disk layout is plugin/skills/skill/SKILL.md.
        for part in (plugin, skill):
            if "/" in part or part.startswith(".") or part in {"", "."}:
                raise ValueError(f"invalid plugin or skill identifier: {part!r}")
        return self._plugins_root / plugin / "skills" / skill / "SKILL.md"

    async def invoke(
        self,
        *,
        session: AsyncSession,
        matter_id: uuid.UUID,
        actor_id: uuid.UUID | None,
        plugin: str,
        skill: str,
        inputs: dict | None = None,
    ) -> PluginInvocationResult:
        path = self._skill_path(plugin, skill)
        if not path.exists():
            raise FileNotFoundError(
                f"skill not found: {plugin}/{skill} (looked at {path}). "
                f"Set PLUGINS_ROOT to the claude-for-uk-legal checkout."
            )

        # Workspace lifecycle check — absence in `workspace_disabled_skills`
        # means enabled (default). The Modules page toggle writes/removes
        # rows here; this is the call-site enforcement.
        if actor_id is not None:
            disabled = await session.scalar(
                select(WorkspaceDisabledSkill).where(
                    WorkspaceDisabledSkill.user_id == actor_id,
                    WorkspaceDisabledSkill.plugin == plugin,
                    WorkspaceDisabledSkill.skill == skill,
                )
            )
            if disabled is not None:
                raise SkillDisabled(plugin, skill)

            # Runtime capability enforcement. Skill bridge needs to read
            # the matter to assemble the prompt and call the model on the
            # skill's behalf. Both are gated. Other capabilities the skill
            # exercises through gateway tools are enforced at the tool
            # boundary, not here.
            from app.core.capabilities import require_capability

            await require_capability(
                session, user_id=actor_id, plugin=plugin, skill=skill,
                capability="matter.read",
            )
            await require_capability(
                session, user_id=actor_id, plugin=plugin, skill=skill,
                capability="model.invoke",
            )

        manifest = _parse_skill_md(path.read_text(encoding="utf-8"))

        # Load the matter — single source of truth for privilege + context.
        matter = await session.scalar(select(Matter).where(Matter.id == matter_id))
        if matter is None:
            raise ValueError(f"matter not found: {matter_id}")

        # Build the prompt: matter context block + the skill body verbatim.
        prompt_parts = [
            "<matter>",
            _render_matter_block(matter),
            "</matter>",
            "",
            "<inputs>",
            "\n".join(f"{k}: {v}" for k, v in (inputs or {}).items()) or "(none)",
            "</inputs>",
            "",
            "<skill name=\"" + manifest.name + "\">",
            manifest.body.strip(),
            "</skill>",
            "",
            "Run the skill above against the matter and inputs. Return the "
            "structured output the skill specifies; if the skill describes a "
            "multi-stage pipeline, output the synthesised final result.",
        ]
        prompt = "\n".join(prompt_parts)

        # Plugin invocation audit row — written BEFORE the model call so a
        # crash mid-call still leaves provenance of the attempt.
        # Lazy import: `app.core.api` re-exports this module's bridge, so a
        # top-level import would create a cycle at startup.
        from app.core.api import audit

        await audit.log(
            session,
            "plugin.invoked",
            actor_id=actor_id,
            matter_id=matter.id,
            module=plugin,
            resource_type="plugin",
            resource_id=f"{plugin}:{skill}",
            payload={
                "plugin": plugin,
                "skill": skill,
                "skill_name": manifest.name,
                "inputs": inputs or {},
                "matter_slug": matter.slug,
            },
        )
        await session.flush()

        # Dispatch through the gateway. Gateway re-reads posture from the DB,
        # writes its own model.call audit row, raises PrivilegePaused if the
        # matter is C_paused.
        result = await self._gateway.call(
            session=session,
            matter_id=matter.id,
            actor_id=actor_id,
            prompt=prompt,
            model=matter.default_model_id,
            resource_type="plugin",
            resource_id=f"{plugin}:{skill}",
            payload={"plugin": plugin, "skill": skill},
            caller_module=f"{plugin}.{skill}",
        )

        return PluginInvocationResult(
            plugin=plugin,
            skill=skill,
            matter_slug=matter.slug,
            response_text=result.text,
            model_used=result.model_used,
            token_count=result.token_count,
            latency_ms=result.latency_ms,
        )


# Module-level singleton — wired with the real gateway and PLUGINS_ROOT in
# main.lifespan. Until then this is None and any caller raises.
bridge: PluginBridge | None = None


def set_bridge(b: PluginBridge) -> None:
    global bridge
    bridge = b

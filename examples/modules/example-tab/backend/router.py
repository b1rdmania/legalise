"""FastAPI router for the example module.

To use this as a template: copy the directory, rename `example_tab` to your module
slug throughout, edit the prompt, then register the router in `app/main.py`.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.api import audit, model_gateway, require_matter

from .service import build_prompt

router = APIRouter()


class HelloResponse(BaseModel):
    output: str
    matter_slug: str


@router.post("/hello", response_model=HelloResponse)
async def hello(matter=Depends(require_matter)) -> HelloResponse:
    """Calls the model gateway with a fixed prompt against the current matter."""
    prompt = build_prompt(matter)

    response = await model_gateway.call(
        matter_id=matter.id,
        prompt=prompt,
        posture=matter.privilege_posture,
    )

    await audit.log(
        action="example-tab.hello",
        matter_id=matter.id,
        metadata={"prompt_length": len(prompt)},
    )

    return HelloResponse(output=response, matter_slug=matter.slug)

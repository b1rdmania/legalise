"""Pre-Motion — Phase 9 reference module.

Second brutal reference module after Contract Review. Tests the
substrate-reusability claim: this module is implemented entirely
from module-author code, with zero edits to ``backend/app/core/``,
``backend/app/api/``, ``backend/app/models/``, or any test outside
``test_phase9_*``.

Single capability ``draft_motion`` that reads multiple matter
documents, calls the provider, and writes TWO artifacts
(``motion_draft`` + ``evidence_list``) in one invocation. The
multi-document + multi-artifact shape is the load-bearing
reusability test — Phase 6's Contract Review covered single-doc
single-artifact, and Phase 6's ``test_different_kinds_on_same_invocation_allowed``
proved the substrate could carry multi-artifact at the storage
level; this module is the first real reference module to use it.

See ``README.md`` for the architectural notes + the args
documentation (``claim_type`` enum, ``document_ids`` shape).
"""

from examples.modules.pre_motion.capability import (
    PreMotionModule,
    draft_motion,
)


__all__ = ["PreMotionModule", "draft_motion"]

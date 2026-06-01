"""Matter context store primitive.

Generic structured-data substrate consumed by reference modules
(``legalise-matter-memory``, future connector modules that write
matter-scoped artifacts). Modules declare typed schemas under their
namespace; the runtime owns schema registry, JSON Schema validation,
item storage, capability-scoped reads/writes, and audit emission.

Per docs/architecture/MATTER_CONTEXT_STORE.md.

Public surface:

    from app.core.matter_context import (
        InvalidSchemaError,
        SchemaNotFoundError,
        ItemNotFoundError,
        register_schema,
        load_schema,
        latest_version_for_namespace,
        list_schemas,
        write_item,
        read_items,
        load_item,
        supersede_item,
    )
"""

from app.core.matter_context.registry import (
    InvalidSchemaError,
    SchemaNotFoundError,
    latest_version_for_namespace,
    list_schemas,
    load_schema,
    register_schema,
)
from app.core.matter_context.store import (
    ItemNotFoundError,
    load_item,
    read_items,
    supersede_item,
    write_item,
)

__all__ = [
    "InvalidSchemaError",
    "SchemaNotFoundError",
    "ItemNotFoundError",
    "register_schema",
    "load_schema",
    "latest_version_for_namespace",
    "list_schemas",
    "write_item",
    "read_items",
    "load_item",
    "supersede_item",
]

# Journeys — Index

Twelve end-to-end user journeys spec'd in this directory. Each file follows the fixed template documented in `PHASE_13_PRODUCT_SURFACE_SPEC_BUILD_PLAN.md` Step 2:

```
preconditions / goal / trigger / steps / audit emissions / acceptance / not covered
```

## Journey index

| # | File | Surface owner | Audit weight |
| --- | --- | --- | --- |
| 00 | `00_first_run.md` | App home + auth + admin | high (open-core narrative) |
| 01 | `01_first_admin_bootstrap.md` | CLI + auth | medium |
| 02 | `02_login_signup.md` | Auth | low (standard) |
| 03 | `03_byo_key_setup.md` | Settings | medium |
| 04 | `04_open_khan.md` | Matters → matter workspace | low |
| 05 | `05_install_module.md` | Modules + trust ceremony | high (signed manifest path) |
| 06 | `06_trust_ceremony.md` | Modules (in-ceremony detail) | high |
| 07 | `07_grant_permissions.md` | Matter workspace → grants | high (matter-scoped) |
| 08 | `08_invoke_contract_review.md` | Matter workspace + invocations | high |
| 09 | `09_invoke_pre_motion.md` | Matter workspace + invocations | high |
| 10 | `10_inspect_artifacts.md` | Artifacts | medium |
| 11 | `11_inspect_reconstruction.md` | Reconstruction / oversight | **load-bearing** |
| 12 | `12_admin_role_promotion.md` | Admin | high (audit-bearing) |

`11_inspect_reconstruction.md` is the load-bearing journey — every other journey deep-links into it on a denial or audit query. If reconstruction renders cleanly, the substrate's claim of "supervised autonomy" is visible in the product.

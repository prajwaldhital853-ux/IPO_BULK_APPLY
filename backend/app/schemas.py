from __future__ import annotations

from pydantic import BaseModel, Field


class CompanyOut(BaseModel):
    id: int
    name: str
    scrip: str | None = None
    first_seen_at: int | None = Field(
        default=None,
        serialization_alias="firstSeenAt",
    )


class CompaniesResponse(BaseModel):
    companies: list[CompanyOut]
    cached: bool = False
    fetched_at: int | None = Field(
        default=None,
        serialization_alias="fetchedAt",
    )
    newly_added_count: int = Field(
        default=0,
        serialization_alias="newlyAddedCount",
    )
    stale: bool = False

    model_config = {"populate_by_name": True}


class CheckRequest(BaseModel):
    company_share_id: int = Field(..., alias="companyShareId")
    boids: list[str] = Field(..., min_length=1)

    model_config = {"populate_by_name": True}


class CheckRow(BaseModel):
    boid: str
    ok: bool
    allotted: bool
    quantity: int | None = None
    message: str
    cached: bool = False


class CheckResponse(BaseModel):
    company_share_id: int = Field(..., serialization_alias="companyShareId")
    results: list[CheckRow]

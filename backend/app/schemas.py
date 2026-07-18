from __future__ import annotations

from pydantic import BaseModel, Field


class CompanyOut(BaseModel):
    id: int
    name: str
    scrip: str | None = None


class CompaniesResponse(BaseModel):
    companies: list[CompanyOut]


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

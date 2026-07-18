from __future__ import annotations

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str = Field(alias='accessToken')
    expires_in: int = Field(alias='expiresIn')
    email: str

    model_config = {'populate_by_name': True}


class AdminSubscriptionRow(BaseModel):
    id: str
    user_id: str = Field(alias='userId')
    user_email: str = Field(alias='userEmail')
    user_name: str = Field(alias='userName')
    user_created_at: str = Field(alias='userCreatedAt')
    user_access_level: str = Field(alias='userAccessLevel')
    plan_id: str = Field(alias='planId')
    plan_title: str = Field(alias='planTitle')
    amount_npr: int = Field(alias='amountNpr')
    status: str
    payment_note: str | None = Field(default=None, alias='paymentNote')
    admin_note: str | None = Field(default=None, alias='adminNote')
    created_at: str = Field(alias='createdAt')
    reviewed_at: str | None = Field(default=None, alias='reviewedAt')
    premium_active: bool = Field(alias='premiumActive')
    premium_expires_at: str | None = Field(default=None, alias='premiumExpiresAt')

    model_config = {'populate_by_name': True}


class AdminActionIn(BaseModel):
    admin_note: str | None = Field(default=None, alias='adminNote')

    model_config = {'populate_by_name': True}


class AdminDashboardStats(BaseModel):
    pending_count: int = Field(alias='pendingCount')
    active_count: int = Field(alias='activeCount')
    total_requests: int = Field(alias='totalRequests')
    total_users: int = Field(alias='totalUsers')

    model_config = {'populate_by_name': True}


class AdminPendingBrief(BaseModel):
    id: str
    plan_id: str = Field(alias='planId')
    plan_title: str = Field(alias='planTitle')
    amount_npr: int = Field(alias='amountNpr')
    created_at: str = Field(alias='createdAt')

    model_config = {'populate_by_name': True}


class AdminUserRow(BaseModel):
    id: str
    google_sub: str = Field(alias='googleSub')
    email: str
    name: str
    avatar_url: str | None = Field(default=None, alias='avatarUrl')
    created_at: str = Field(alias='createdAt')
    access_level: str = Field(alias='accessLevel')
    premium_plan: str | None = Field(default=None, alias='premiumPlan')
    premium_expires_at: str | None = Field(default=None, alias='premiumExpiresAt')
    premium_source: str | None = Field(default=None, alias='premiumSource')
    pending_request: AdminPendingBrief | None = Field(default=None, alias='pendingRequest')
    subscription_request_count: int = Field(alias='subscriptionRequestCount')
    last_subscription_at: str | None = Field(default=None, alias='lastSubscriptionAt')

    model_config = {'populate_by_name': True}

from __future__ import annotations

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    email: str
    password: str
    # Stable per-install id from the app — lockouts + new-device OTP.
    device_id: str | None = Field(default=None, alias='deviceId', max_length=128)

    model_config = {'populate_by_name': True}


class AdminLoginVerifyRequest(BaseModel):
    email: str
    password: str
    otp: str = Field(min_length=6, max_length=6)
    device_id: str = Field(alias='deviceId', min_length=8, max_length=128)

    model_config = {'populate_by_name': True}


class AdminLoginResponse(BaseModel):
    access_token: str = Field(
        default='',
        alias='accessToken',
        serialization_alias='accessToken',
    )
    expires_in: int = Field(
        default=0,
        alias='expiresIn',
        serialization_alias='expiresIn',
    )
    email: str
    needs_otp: bool = Field(
        default=False,
        alias='needsOtp',
        serialization_alias='needsOtp',
    )
    masked_email: str | None = Field(
        default=None,
        alias='maskedEmail',
        serialization_alias='maskedEmail',
    )

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
    new_feedback_count: int = Field(alias='newFeedbackCount')
    blocked_user_count: int = Field(default=0, alias='blockedUserCount')
    multi_device_user_count: int = Field(default=0, alias='multiDeviceUserCount')
    premium_user_count: int = Field(default=0, alias='premiumUserCount')
    pending_user_count: int = Field(default=0, alias='pendingUserCount')
    free_user_count: int = Field(default=0, alias='freeUserCount')
    approved_request_count: int = Field(default=0, alias='approvedRequestCount')
    rejected_request_count: int = Field(default=0, alias='rejectedRequestCount')
    feedback_read_count: int = Field(default=0, alias='feedbackReadCount')
    feedback_resolved_count: int = Field(default=0, alias='feedbackResolvedCount')
    feedback_total_count: int = Field(default=0, alias='feedbackTotalCount')

    model_config = {'populate_by_name': True}


class AdminPendingBrief(BaseModel):
    id: str
    plan_id: str = Field(alias='planId')
    plan_title: str = Field(alias='planTitle')
    amount_npr: int = Field(alias='amountNpr')
    created_at: str = Field(alias='createdAt')

    model_config = {'populate_by_name': True}


class AdminUserDeviceRow(BaseModel):
    device_id: str = Field(alias='deviceId')
    device_label: str = Field(alias='deviceLabel')
    platform: str = 'android'
    account_count: int = Field(alias='accountCount')
    last_seen_at: str = Field(alias='lastSeenAt')

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
    max_accounts: int = Field(alias='maxAccounts')
    pending_request: AdminPendingBrief | None = Field(default=None, alias='pendingRequest')
    subscription_request_count: int = Field(alias='subscriptionRequestCount')
    last_subscription_at: str | None = Field(default=None, alias='lastSubscriptionAt')
    claimed_total: int = Field(default=0, alias='claimedTotal')
    device_count: int = Field(default=0, alias='deviceCount')
    devices: list[AdminUserDeviceRow] = Field(default_factory=list)
    is_blocked: bool = Field(default=False, alias='isBlocked')
    blocked_at: str | None = Field(default=None, alias='blockedAt')
    blocked_reason: str | None = Field(default=None, alias='blockedReason')

    model_config = {'populate_by_name': True}


class AdminPaginatedUsersOut(BaseModel):
    items: list[AdminUserRow]
    page: int
    page_size: int = Field(alias='pageSize')
    total_count: int = Field(alias='totalCount')
    total_pages: int = Field(alias='totalPages')
    has_more: bool = Field(alias='hasMore')
    next_cursor: str | None = Field(default=None, alias='nextCursor')

    model_config = {'populate_by_name': True}


class AdminPaginatedSubscriptionsOut(BaseModel):
    items: list[AdminSubscriptionRow]
    page: int
    page_size: int = Field(alias='pageSize')
    total_count: int = Field(alias='totalCount')
    total_pages: int = Field(alias='totalPages')
    has_more: bool = Field(alias='hasMore')
    next_cursor: str | None = Field(default=None, alias='nextCursor')

    model_config = {'populate_by_name': True}


class AdminMaxAccountsIn(BaseModel):
    # 999999 = unlimited (admin-controlled). No hard 500 cap.
    max_accounts: int = Field(alias='maxAccounts', ge=1, le=999999)

    model_config = {'populate_by_name': True}


class PaymentSettingsOut(BaseModel):
    qr_text: str = Field(alias='qrText')
    qr_image_url: str | None = Field(default=None, alias='qrImageUrl')
    bank_name: str = Field(alias='bankName')
    account_name: str = Field(alias='accountName')
    account_number: str = Field(alias='accountNumber')
    whatsapp: str
    whatsapp_url: str = Field(alias='whatsappUrl')

    model_config = {'populate_by_name': True}


class PaymentSettingsIn(BaseModel):
    qr_text: str = Field(alias='qrText')
    bank_name: str = Field(alias='bankName')
    account_name: str = Field(alias='accountName')
    account_number: str = Field(alias='accountNumber')
    whatsapp: str
    qr_image_base64: str | None = Field(default=None, alias='qrImageBase64')
    clear_qr_image: bool = Field(default=False, alias='clearQrImage')

    model_config = {'populate_by_name': True}


class SocialLinkOut(BaseModel):
    id: str
    platform: str
    label: str
    detail: str = ''
    url: str

    model_config = {'populate_by_name': True}


class SocialLinkIn(BaseModel):
    id: str | None = None
    platform: str
    label: str
    detail: str = ''
    url: str

    model_config = {'populate_by_name': True}


class ContactSettingsOut(BaseModel):
    company_name: str = Field(alias='companyName')
    email: str
    whatsapp: str
    whatsapp_url: str = Field(alias='whatsappUrl')
    facebook_url: str | None = Field(default=None, alias='facebookUrl')
    tiktok_url: str | None = Field(default=None, alias='tiktokUrl')
    social_links: list[SocialLinkOut] = Field(default_factory=list, alias='socialLinks')

    model_config = {'populate_by_name': True}


class ContactSettingsIn(BaseModel):
    company_name: str = Field(alias='companyName')
    email: str
    whatsapp: str
    whatsapp_url: str = Field(alias='whatsappUrl')
    facebook_url: str | None = Field(default=None, alias='facebookUrl')
    tiktok_url: str | None = Field(default=None, alias='tiktokUrl')
    social_links: list[SocialLinkIn] | None = Field(default=None, alias='socialLinks')

    model_config = {'populate_by_name': True}


class PopupNoticeItemOut(BaseModel):
    id: str
    image_url: str | None = Field(default=None, alias='imageUrl')
    text: str | None = None
    kind: str = 'image'  # image | text

    model_config = {'populate_by_name': True}


class PopupNoticesOut(BaseModel):
    items: list[PopupNoticeItemOut] = Field(default_factory=list)

    model_config = {'populate_by_name': True}


class PopupNoticeIn(BaseModel):
    """Append image/text notice, delete one, or clear all startup notices."""

    image_base64: str | None = Field(default=None, alias='imageBase64')
    text: str | None = None
    delete_id: str | None = Field(default=None, alias='deleteId')
    clear_all: bool = Field(default=False, alias='clearAll')
    # Legacy aliases kept for older clients
    clear_image: bool = Field(default=False, alias='clearImage')

    model_config = {'populate_by_name': True}


class HomePromoSettingsOut(BaseModel):
    visible: bool = True
    text: str = (
        'Add your MeroShare account to bulk apply for IPOs — '
        'tap here to get started'
    )
    # none = not clickable; otherwise a known in-app route key
    action: str = 'AddCapital'
    color: str = '#1B5E20'

    model_config = {'populate_by_name': True}


class HomePromoSettingsIn(BaseModel):
    visible: bool | None = None
    text: str | None = None
    action: str | None = None
    color: str | None = None

    model_config = {'populate_by_name': True}


class HomePromoPagesOut(BaseModel):
    home: HomePromoSettingsOut = Field(default_factory=HomePromoSettingsOut)
    apply: HomePromoSettingsOut = Field(default_factory=HomePromoSettingsOut)
    services: HomePromoSettingsOut = Field(default_factory=HomePromoSettingsOut)
    check: HomePromoSettingsOut = Field(default_factory=HomePromoSettingsOut)
    profile: HomePromoSettingsOut = Field(default_factory=HomePromoSettingsOut)


class HomePromoPagesIn(BaseModel):
    home: HomePromoSettingsIn | None = None
    apply: HomePromoSettingsIn | None = None
    services: HomePromoSettingsIn | None = None
    check: HomePromoSettingsIn | None = None
    profile: HomePromoSettingsIn | None = None


class LegalSectionOut(BaseModel):
    heading: str
    body: str


class LegalDocOut(BaseModel):
    intro: str = ''
    sections: list[LegalSectionOut] = Field(default_factory=list)


class AboutPageOut(BaseModel):
    tagline: str = ''
    who_we_are: str = Field(default='', alias='whoWeAre')
    offerings: list[str] = Field(default_factory=list)

    model_config = {'populate_by_name': True}


class LegalPagesOut(BaseModel):
    about: AboutPageOut = Field(default_factory=AboutPageOut)
    terms: LegalDocOut = Field(default_factory=LegalDocOut)
    privacy: LegalDocOut = Field(default_factory=LegalDocOut)


class LegalSectionIn(BaseModel):
    heading: str = ''
    body: str = ''


class LegalDocIn(BaseModel):
    intro: str | None = None
    sections: list[LegalSectionIn] | None = None


class AboutPageIn(BaseModel):
    tagline: str | None = None
    who_we_are: str | None = Field(default=None, alias='whoWeAre')
    offerings: list[str] | None = None

    model_config = {'populate_by_name': True}


class LegalPagesIn(BaseModel):
    about: AboutPageIn | None = None
    terms: LegalDocIn | None = None
    privacy: LegalDocIn | None = None


class AdminSettingsOut(BaseModel):
    admin_email: str = Field(alias='adminEmail')
    payment: PaymentSettingsOut
    contact: ContactSettingsOut
    popup_notice: PopupNoticesOut = Field(alias='popupNotice')
    subscription_plans: list[SubscriptionPlanOut] = Field(
        default_factory=list,
        alias='subscriptionPlans',
    )
    app_logo_url: str | None = Field(default=None, alias='appLogoUrl')
    home_promo: HomePromoSettingsOut = Field(
        default_factory=HomePromoSettingsOut,
        alias='homePromo',
    )
    home_promos: HomePromoPagesOut = Field(
        default_factory=HomePromoPagesOut,
        alias='homePromos',
    )
    legal_pages: LegalPagesOut = Field(
        default_factory=LegalPagesOut,
        alias='legalPages',
    )

    model_config = {'populate_by_name': True}


class AdminSettingsUpdateIn(BaseModel):
    payment: PaymentSettingsIn | None = None
    contact: ContactSettingsIn | None = None
    popup_notice: PopupNoticeIn | None = Field(default=None, alias='popupNotice')
    subscription_plans: list[SubscriptionPlanIn] | None = Field(
        default=None,
        alias='subscriptionPlans',
    )
    app_logo_base64: str | None = Field(default=None, alias='appLogoBase64')
    clear_app_logo: bool = Field(default=False, alias='clearAppLogo')
    home_promo: HomePromoSettingsIn | None = Field(
        default=None,
        alias='homePromo',
    )
    home_promos: HomePromoPagesIn | None = Field(
        default=None,
        alias='homePromos',
    )
    legal_pages: LegalPagesIn | None = Field(default=None, alias='legalPages')

    model_config = {'populate_by_name': True}


class AdminPasswordChangeIn(BaseModel):
    current_password: str = Field(alias='currentPassword')
    new_password: str = Field(alias='newPassword')

    model_config = {'populate_by_name': True}


class AdminForgotPasswordIn(BaseModel):
    email: str


class AdminResetPasswordIn(BaseModel):
    email: str
    otp: str
    new_password: str = Field(alias='newPassword')

    model_config = {'populate_by_name': True}


class SubscriptionPlanOut(BaseModel):
    id: str
    title: str
    price_label: str = Field(alias='priceLabel')
    amount_npr: int = Field(alias='amountNpr')
    period: str
    days: int
    max_accounts: int = Field(alias='maxAccounts')
    perks: list[str] = Field(default_factory=list)

    model_config = {'populate_by_name': True}


class SubscriptionPlanIn(BaseModel):
    id: str
    title: str
    price_label: str = Field(alias='priceLabel')
    amount_npr: int = Field(alias='amountNpr', ge=1)
    period: str = ''
    days: int = Field(ge=1)
    max_accounts: int = Field(alias='maxAccounts', ge=1, default=50)
    perks: list[str] = Field(default_factory=list)

    model_config = {'populate_by_name': True}


class PublicAppSettingsOut(BaseModel):
    payment: PaymentSettingsOut
    contact: ContactSettingsOut
    popup_notice: PopupNoticesOut = Field(
        default_factory=PopupNoticesOut,
        alias='popupNotice',
    )
    subscription_plans: list[SubscriptionPlanOut] = Field(
        default_factory=list,
        alias='subscriptionPlans',
    )
    app_logo_url: str | None = Field(default=None, alias='appLogoUrl')
    home_promo: HomePromoSettingsOut = Field(
        default_factory=HomePromoSettingsOut,
        alias='homePromo',
    )
    home_promos: HomePromoPagesOut = Field(
        default_factory=HomePromoPagesOut,
        alias='homePromos',
    )
    legal_pages: LegalPagesOut = Field(
        default_factory=LegalPagesOut,
        alias='legalPages',
    )

    model_config = {'populate_by_name': True}


class FeedbackSubmitIn(BaseModel):
    kind: str
    name: str = ''
    email: str = ''
    message: str

    model_config = {'populate_by_name': True}


class FeedbackSubmitOut(BaseModel):
    id: str
    ok: bool = True

    model_config = {'populate_by_name': True}


class FeedbackRowOut(BaseModel):
    id: str
    kind: str
    name: str
    email: str
    message: str
    user_id: str | None = Field(default=None, alias='userId')
    status: str
    created_at: str = Field(alias='createdAt')

    model_config = {'populate_by_name': True}


class FeedbackStatusIn(BaseModel):
    status: str


class TeamMemberOut(BaseModel):
    id: str
    name: str
    role: str
    bio: str
    email: str | None = None
    whatsapp: str | None = None
    accent: str
    photo_url: str | None = Field(default=None, alias='photoUrl')
    sort_order: int = Field(alias='sortOrder')

    model_config = {'populate_by_name': True}


class TeamMemberIn(BaseModel):
    name: str
    role: str = ''
    bio: str = ''
    email: str | None = None
    whatsapp: str | None = None
    accent: str = '#42A5F5'
    sort_order: int = Field(default=0, alias='sortOrder')
    photo_base64: str | None = Field(default=None, alias='photoBase64')
    clear_photo: bool = Field(default=False, alias='clearPhoto')

    model_config = {'populate_by_name': True}


class MarketClosureOut(BaseModel):
    id: str
    date: str
    title: str
    notice: str
    color: str
    active: bool

    model_config = {'populate_by_name': True}


class MarketClosureIn(BaseModel):
    date: str
    title: str = 'NEPSE Closed'
    notice: str = ''
    color: str = '#E53935'
    active: bool = True

    model_config = {'populate_by_name': True}


class ManagedOfferingOut(BaseModel):
    id: str
    match_key: str = Field(alias='matchKey')
    name: str
    symbol: str = ''
    type: str
    audience: str | None = None
    issue_manager: str | None = Field(default=None, alias='issueManager')
    status: str = 'ComingSoon'
    display_section: str = Field(default='both', alias='displaySection')
    units: int | None = None
    applied_units: int | None = Field(default=None, alias='appliedUnits')
    applicants: int | None = None
    price: float | None = None
    total_amount: float | None = Field(default=None, alias='totalAmount')
    applied_amount: float | None = Field(default=None, alias='appliedAmount')
    opening_date: str | None = Field(default=None, alias='openingDate')
    closing_date: str | None = Field(default=None, alias='closingDate')
    extended_closing_date: str | None = Field(
        default=None,
        alias='extendedClosingDate',
    )
    right_share_ratio: str | None = Field(default=None, alias='rightShareRatio')
    active: bool = True
    updated_at: str | None = Field(default=None, alias='updatedAt')

    model_config = {'populate_by_name': True}


class ManagedOfferingIn(BaseModel):
    name: str
    symbol: str = ''
    type: str = 'Ipo'
    audience: str | None = None
    issue_manager: str | None = Field(default=None, alias='issueManager')
    status: str = 'ComingSoon'
    display_section: str = Field(default='both', alias='displaySection')
    units: int | None = None
    applied_units: int | None = Field(default=None, alias='appliedUnits')
    applicants: int | None = None
    price: float | None = None
    total_amount: float | None = Field(default=None, alias='totalAmount')
    applied_amount: float | None = Field(default=None, alias='appliedAmount')
    opening_date: str | None = Field(default=None, alias='openingDate')
    closing_date: str | None = Field(default=None, alias='closingDate')
    extended_closing_date: str | None = Field(
        default=None,
        alias='extendedClosingDate',
    )
    right_share_ratio: str | None = Field(default=None, alias='rightShareRatio')
    active: bool = True
    match_key: str | None = Field(default=None, alias='matchKey')

    model_config = {'populate_by_name': True}


class AdminNotificationSendIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=1000)
    audience: str = Field(pattern=r'^(free|premium|all)$')
    redirect_screen: str = Field(alias='redirectScreen', min_length=1, max_length=64)
    redirect_symbol: str | None = Field(default=None, alias='redirectSymbol', max_length=32)
    image_base64: str | None = Field(default=None, alias='imageBase64')

    model_config = {'populate_by_name': True}


class AdminNotificationHistoryOut(BaseModel):
    id: str
    title: str
    body: str
    audience: str
    redirect_screen: str = Field(alias='redirectScreen')
    redirect_symbol: str | None = Field(default=None, alias='redirectSymbol')
    has_image: bool = Field(default=False, alias='hasImage')
    token_count: int = Field(alias='tokenCount')
    sent_count: int = Field(alias='sentCount')
    sent_by: str = Field(alias='sentBy')
    created_at: str | None = Field(default=None, alias='createdAt')

    model_config = {'populate_by_name': True}


class AdminNotificationRedirectOption(BaseModel):
    id: str
    label: str
    needs_symbol: bool = Field(alias='needsSymbol')

    model_config = {'populate_by_name': True}


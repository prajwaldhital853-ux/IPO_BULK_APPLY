from __future__ import annotations

from .admin.schemas import ContactSettingsOut, PaymentSettingsOut, PublicAppSettingsOut
from .db.models import SiteSettings


def _payment_out(row: SiteSettings) -> PaymentSettingsOut:
    wa = row.payment_whatsapp.strip()
    wa_url = f'https://wa.me/{wa}' if wa else ''
    return PaymentSettingsOut(
        qrText=row.payment_qr_text,
        bankName=row.payment_bank_name,
        accountName=row.payment_account_name,
        accountNumber=row.payment_account_number,
        whatsapp=wa,
        whatsappUrl=wa_url,
    )


def _contact_out(row: SiteSettings) -> ContactSettingsOut:
    return ContactSettingsOut(
        companyName=row.contact_company_name,
        email=row.contact_email,
        whatsapp=row.contact_whatsapp,
        whatsappUrl=row.contact_whatsapp_url,
        facebookUrl=row.contact_facebook_url or None,
        tiktokUrl=row.contact_tiktok_url or None,
    )


def settings_to_public(row: SiteSettings) -> PublicAppSettingsOut:
    return PublicAppSettingsOut(
        payment=_payment_out(row),
        contact=_contact_out(row),
    )

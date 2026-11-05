"""Gửi email qua SMTP (cấu hình bằng biến môi trường SMTP_*)."""
import html
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings
from app.core.security import PASSWORD_RESET_OTP_EXPIRE_MINUTES

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 15


def is_email_configured() -> bool:
    return bool(settings.smtp.host and (settings.smtp.from_address or settings.smtp.username))


def send_email(to: str, subject: str, text_body: str, html_body: str) -> None:
    config = settings.smtp
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config.from_address or config.username
    message["To"] = to
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    if config.security == "ssl":
        server = smtplib.SMTP_SSL(config.host, config.port, timeout=SMTP_TIMEOUT_SECONDS, context=context)
    else:
        server = smtplib.SMTP(config.host, config.port, timeout=SMTP_TIMEOUT_SECONDS)
    with server:
        # Giá trị gõ sai vẫn dùng STARTTLS: chỉ tắt mã hoá khi cấu hình đúng "none".
        if config.security not in ("ssl", "none"):
            server.starttls(context=context)
        if config.username:
            server.login(config.username, config.password)
        server.send_message(message)


def send_password_reset_email(to: str, full_name: str | None, otp: str) -> None:
    """Chạy trong BackgroundTasks: response đã trả về nên lỗi gửi mail chỉ ghi log."""
    name = full_name or "bạn"
    expires = f"{PASSWORD_RESET_OTP_EXPIRE_MINUTES} phút"

    text_body = (
        f"Xin chào {name},\n\n"
        "Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản GraduAI của bạn.\n"
        f"Mã xác nhận của bạn là: {otp}\n\n"
        f"Mã có hiệu lực {expires} và chỉ dùng được một lần. Không chia sẻ mã này cho bất kỳ ai.\n"
        "Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.\n"
    )
    html_body = f"""\
<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:480px">
  <p>Xin chào {html.escape(name)},</p>
  <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản GraduAI của bạn. Mã xác nhận của bạn là:</p>
  <p style="margin:24px 0;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0d9488">{otp}</p>
  <p>Mã có hiệu lực {expires} và chỉ dùng được một lần. Không chia sẻ mã này cho bất kỳ ai.</p>
  <p style="color:#64748b">Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.</p>
</div>
"""
    try:
        # Không đưa mã vào tiêu đề: tiêu đề hiện ngay trên thông báo màn hình khoá.
        send_email(to, "Mã xác nhận đặt lại mật khẩu GraduAI", text_body, html_body)
    except Exception:
        logger.exception("Không gửi được email đặt lại mật khẩu")
